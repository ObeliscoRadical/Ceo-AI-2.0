import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CEOOrb } from "@/components/CEOOrb";
import { CEOHumanoidReactor } from "@/components/CEOHumanoidReactor";
import { api } from "@/lib/api";
import { Mic, X, Loader2, Volume2 } from "lucide-react";

const STATUS_LABEL = { idle: "Toca para conversar", listening: "A ouvir… fala normalmente", thinking: "A preparar resposta…", speaking: "" };

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
  const [audioReady, setAudioReady] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const mrRef = useRef(null); const chunksRef = useRef([]); const streamRef = useRef(null);
  const acRef = useRef(null); const analyserRef = useRef(null); const rafRef = useRef(null);
  const audioRef = useRef(null); const audioUrlRef = useRef(null); const replyLevelsRef = useRef(null); const sidRef = useRef(sessionId);
  const continuousRef = useRef(false); const speechStartedRef = useRef(false);
  const lastVoiceAtRef = useRef(0); const listenStartedAtRef = useRef(0); const discardRecordingRef = useRef(false);

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

  const clearAudio = () => {
    audioRef.current?.pause();
    audioRef.current?.removeAttribute("src");
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    replyLevelsRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setAmp(0);
    setAudioReady(false);
  };

  const cleanup = () => {
    continuousRef.current = false;
    discardRecordingRef.current = true;
    cancelAnimationFrame(rafRef.current);
    try { mrRef.current?.state === "recording" && mrRef.current.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    clearAudio(); analyserRef.current = null;
    setAmp(0); setStatus("idle");
  };

  const runAmpLoop = () => {
    const a = analyserRef.current; if (!a) return;
    const buf = new Uint8Array(a.fftSize);
    const tick = () => {
      if (mrRef.current?.state !== "recording") return;
      a.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const level = Math.sqrt(sum / buf.length);
      setAmp(Math.min(1, level * 3.2));
      const now = performance.now();
      if (level > 0.025) {
        speechStartedRef.current = true;
        lastVoiceAtRef.current = now;
      } else if (speechStartedRef.current && now - lastVoiceAtRef.current > 1300 && now - listenStartedAtRef.current > 800) {
        stopListening();
        return;
      }
      if (!speechStartedRef.current && now - listenStartedAtRef.current > 12000) {
        discardRecordingRef.current = true;
        continuousRef.current = false;
        stopListening();
        setReplyText("Não ouvi a tua voz. Toca no microfone para tentar outra vez.");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const runReplyAmpLoop = () => {
    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused) return;
      const levels = replyLevelsRef.current;
      const index = Math.floor(audio.currentTime * 30);
      setAmp(levels?.[index] ?? 0.12);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const analyseReply = async (buffer, url) => {
    try {
      const decoded = await acRef.current.decodeAudioData(buffer.slice(0));
      if (audioUrlRef.current !== url) return;
      const samples = decoded.getChannelData(0);
      const step = Math.max(1, Math.floor(decoded.sampleRate / 30));
      const levels = new Float32Array(Math.ceil(samples.length / step));
      for (let i = 0; i < levels.length; i++) {
        let sum = 0;
        const end = Math.min(samples.length, (i + 1) * step);
        for (let j = i * step; j < end; j++) sum += samples[j] * samples[j];
        levels[i] = Math.min(1, Math.sqrt(sum / (end - i * step)) * 3.2);
      }
      replyLevelsRef.current = levels;
    } catch { /* Playback remains available if analysis is unsupported. */ }
  };

  const pickMime = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || "";

  const startListening = async (keepReply = false) => {
    if (!keepReply) { setUserText(""); setReplyText(""); }
    clearAudio(); setPlaybackError("");
    try {
      await ensureContext(); // unlock audio within the tap gesture
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const src = acRef.current.createMediaStreamSource(stream);
      const an = acRef.current.createAnalyser(); an.fftSize = 512; src.connect(an);
      analyserRef.current = an;
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mrRef.current = mr; chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = handleStop;
      speechStartedRef.current = false;
      discardRecordingRef.current = false;
      listenStartedAtRef.current = performance.now();
      mr.start(); setStatus("listening"); runAmpLoop();
    } catch (e) {
      continuousRef.current = false;
      setStatus("idle");
      if (keepReply) setPlaybackError("Toca no microfone para continuar a conversa.");
      else setReplyText("Preciso de acesso ao microfone para conversar por voz.");
    }
  };

  const stopListening = () => {
    if (mrRef.current?.state !== "recording") return;
    cancelAnimationFrame(rafRef.current); setAmp(0);
    try { mrRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setStatus("thinking");
  };

  const handleStop = async () => {
    if (discardRecordingRef.current) { setStatus("idle"); return; }
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
      if (data.audio_base64) await speak(data.audio_base64);
      else { setPlaybackError("O CEO respondeu em texto, mas o áudio não foi gerado."); setStatus("idle"); }
    } catch (e) {
      setReplyText(e?.response?.data?.detail || "Não consegui perceber. Tenta outra vez.");
      setStatus("idle");
    }
  };

  const speak = async (b64) => {
    try {
      clearAudio();
      const buffer = b64ToBuf(b64);
      const url = URL.createObjectURL(new Blob([buffer], { type: "audio/mpeg" }));
      audioUrlRef.current = url;
      const audio = audioRef.current;
      if (!audio) { clearAudio(); setStatus("idle"); return; }
      audio.src = url;
      setAudioReady(true);
      setPlaybackError("");
      if (acRef.current) analyseReply(buffer, url);
      await audio.play();
    } catch (e) {
      setPlaybackError("Toca em «Ouvir resposta» para reproduzir o áudio no iPhone.");
      setStatus("idle");
    }
  };

  const playReply = () => {
    const audio = audioRef.current;
    if (!audio || !audioReady) return;
    setPlaybackError("");
    if (audio.readyState > 0) audio.currentTime = 0;
    try {
      audio.play()?.catch(() => setPlaybackError("Não foi possível reproduzir o áudio neste dispositivo."));
    } catch {
      setPlaybackError("Não foi possível reproduzir o áudio neste dispositivo.");
    }
  };

  const stopSpeaking = () => {
    continuousRef.current = false;
    audioRef.current?.pause();
    cancelAnimationFrame(rafRef.current); setAmp(0);
    setStatus("idle");
  };

  const onMainButton = () => {
    if (status === "idle") { continuousRef.current = true; startListening(); }
    else if (status === "listening") stopListening();
    else if (status === "speaking") { stopSpeaking(); continuousRef.current = true; startListening(true); }
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
        <audio ref={audioRef} onPlay={() => { setStatus("speaking"); runReplyAmpLoop(); }}
          onEnded={() => {
            cancelAnimationFrame(rafRef.current); setAmp(0); setStatus("idle");
            if (continuousRef.current) startListening(true);
          }}
          onError={() => { if (audioUrlRef.current) { setPlaybackError("Não foi possível reproduzir o áudio neste dispositivo."); setStatus("idle"); } }} />
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

        {audioReady && status === "idle" && (
          <button onClick={playReply} data-testid="voice-play-reply"
            className="mt-3 flex items-center gap-2 rounded-full border border-[#00F0FF]/40 px-5 py-2.5 text-sm text-[#00F0FF] hover:bg-[#00F0FF]/10">
            <Volume2 className="w-4 h-4" /> Ouvir resposta
          </button>
        )}
        {playbackError && <p className="mt-2 px-8 text-center text-sm text-white/60" role="status">{playbackError}</p>}

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
        <p className="mt-4 text-white/30 text-xs">{status === "listening" ? "Envia automaticamente quando terminares de falar" : "Toca uma vez no microfone para começar"}</p>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
