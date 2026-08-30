import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CEOOrb } from "@/components/CEOOrb";
import { CEOHumanoidReactor } from "@/components/CEOHumanoidReactor";
import { api } from "@/lib/api";
import { Mic, X, Loader2 } from "lucide-react";

const STATUS_LABEL = { idle: "Toca para falar", listening: "A ouvir…", thinking: "A pensar…", speaking: "" };

const b64ToBuf = (b64) => {
  const bin = atob(b64); const len = bin.length; const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

export function VoiceMode({ open, onClose, sessionId, onSession }) {
  const [status, setStatus] = useState("idle");
  const [amp, setAmp] = useState(0);
  const [userText, setUserText] = useState("");
  const [replyText, setReplyText] = useState("");
  const mrRef = useRef(null); const chunksRef = useRef([]); const streamRef = useRef(null);
  const acRef = useRef(null); const analyserRef = useRef(null); const rafRef = useRef(null);
  const srcNodeRef = useRef(null); const sidRef = useRef(sessionId);

  useEffect(() => { sidRef.current = sessionId; }, [sessionId]);
  useEffect(() => { if (!open) cleanup(); return cleanup; /* eslint-disable-next-line */ }, [open]);

  const ensureContext = async () => {
    if (!acRef.current) acRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (acRef.current.state === "suspended") { try { await acRef.current.resume(); } catch {} }
    // unlock playback on mobile with a silent buffer (must run inside a user gesture)
    try {
      const b = acRef.current.createBuffer(1, 1, 22050);
      const s = acRef.current.createBufferSource(); s.buffer = b; s.connect(acRef.current.destination); s.start(0);
    } catch {}
    return acRef.current;
  };

  const cleanup = () => {
    cancelAnimationFrame(rafRef.current);
    try { mrRef.current?.state === "recording" && mrRef.current.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try { srcNodeRef.current?.stop(); } catch {}
    srcNodeRef.current = null; analyserRef.current = null;
    setAmp(0); setStatus("idle");
  };

  const runAmpLoop = () => {
    const a = analyserRef.current; if (!a) return;
    const buf = new Uint8Array(a.fftSize);
    const tick = () => {
      a.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      setAmp(Math.min(1, Math.sqrt(sum / buf.length) * 3.2));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const pickMime = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || "";

  const startListening = async () => {
    setUserText(""); setReplyText("");
    try {
      await ensureContext(); // unlock audio within the tap gesture
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const src = acRef.current.createMediaStreamSource(stream);
      const an = acRef.current.createAnalyser(); an.fftSize = 512; src.connect(an);
      analyserRef.current = an; runAmpLoop();
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mrRef.current = mr; chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = handleStop;
      mr.start(); setStatus("listening");
    } catch (e) {
      setStatus("idle"); setReplyText("Preciso de acesso ao microfone para conversar por voz.");
    }
  };

  const stopListening = () => {
    cancelAnimationFrame(rafRef.current); setAmp(0);
    try { mrRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setStatus("thinking");
  };

  const handleStop = async () => {
    const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || "audio/webm" });
    if (blob.size < 800) { setStatus("idle"); return; }
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    const fd = new FormData();
    fd.append("file", blob, `voz.${ext}`);
    if (sidRef.current) fd.append("session_id", sidRef.current);
    try {
      const { data } = await api.post("/voice/chat", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setUserText(data.user_text); setReplyText(data.reply_text);
      if (data.session_id) { sidRef.current = data.session_id; onSession?.(data.session_id); }
      if (data.audio_base64) await speak(data.audio_base64); else setStatus("idle");
    } catch (e) {
      setReplyText(e?.response?.data?.detail || "Não consegui perceber. Tenta outra vez.");
      setStatus("idle");
    }
  };

  const speak = async (b64) => {
    setStatus("speaking");
    try {
      const ac = await ensureContext();
      const audioBuffer = await ac.decodeAudioData(b64ToBuf(b64));
      const src = ac.createBufferSource(); src.buffer = audioBuffer;
      const an = ac.createAnalyser(); an.fftSize = 512;
      src.connect(an); an.connect(ac.destination);
      analyserRef.current = an; srcNodeRef.current = src; runAmpLoop();
      src.onended = () => { cancelAnimationFrame(rafRef.current); setAmp(0); setStatus("idle"); };
      src.start(0);
    } catch (e) {
      // playback failed — reply text is still shown
      setStatus("idle");
    }
  };

  const stopSpeaking = () => { try { srcNodeRef.current?.stop(); } catch {} cancelAnimationFrame(rafRef.current); setAmp(0); setStatus("idle"); };

  const onMainButton = () => {
    if (status === "idle") startListening();
    else if (status === "listening") stopListening();
    else if (status === "speaking") stopSpeaking();
  };

  if (!open) return null;
  const scale = 1 + amp * 0.28;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
        style={{ background: "radial-gradient(circle at 50% 40%, #0A0F1E, #05060C 70%)" }}
        data-testid="voice-mode"
      >
        <button onClick={onClose} data-testid="voice-close" className="absolute top-6 right-6 w-11 h-11 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">
          <X className="w-6 h-6" />
        </button>

        <motion.div animate={{ scale }} transition={{ type: "spring", stiffness: 120, damping: 18 }} className="relative flex items-center justify-center">
          <div className="absolute rounded-full" style={{ inset: -50, background: `radial-gradient(circle, rgba(0,240,255,${0.18 + amp * 0.45}), transparent 70%)`, filter: "blur(28px)" }} />
          <CEOHumanoidReactor size={340} isSpeaking={status === "speaking"} isListening={status === "listening"} amplitude={amp} />
        </motion.div>

        <p className="mt-12 text-white/50 text-sm tracking-[0.2em] uppercase h-5" data-testid="voice-status">{STATUS_LABEL[status]}</p>

        <div className="mt-6 max-w-xl px-8 text-center min-h-[80px]">
          {userText && <p className="text-white/40 text-sm mb-3" data-testid="voice-user-text">“{userText}”</p>}
          {status === "thinking" ? (
            <Loader2 className="w-5 h-5 animate-spin text-[#3B82F6] mx-auto" />
          ) : (
            replyText && <p className="text-white text-lg leading-relaxed font-serif-lux" data-testid="voice-reply-text">{replyText}</p>
          )}
        </div>

        <button
          onClick={onMainButton} data-testid="voice-mic-button"
          className="mt-12 w-20 h-20 rounded-full flex items-center justify-center transition-all"
          style={{
            background: status === "listening" ? "#EF4444" : "#3B82F6",
            boxShadow: `0 0 ${20 + amp * 40}px ${status === "listening" ? "rgba(239,68,68,0.6)" : "rgba(59,130,246,0.6)"}`,
          }}
        >
          {status === "thinking" ? <Loader2 className="w-8 h-8 animate-spin text-white" /> : <Mic className="w-8 h-8 text-white" />}
        </button>
        <p className="mt-4 text-white/30 text-xs">{status === "listening" ? "Toca para enviar" : "Toca no micro e fala"}</p>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
