import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, streamChat } from "@/lib/api";
import { VoiceSphere } from "@/components/VoiceSphere";
import { CEOOrb } from "@/components/CEOOrb";
import { CEOHumanoidReactor } from "@/components/CEOHumanoidReactor";
import { VoiceMode } from "@/components/VoiceMode";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Send, Loader2, Plus, MessageSquare, Trash2, Mic, Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";

const SUGGESTIONS = [
  "Posso tirar férias este mês?",
  "Posso comprar uma carrinha?",
  "Porque estou sempre sem caixa?",
  "Posso contratar mais um técnico?",
];

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const endRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  const loadSessions = useCallback(async () => {
    const { data } = await api.get("/chat/sessions");
    setSessions(data);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const openSession = async (sid) => {
    setSessionId(sid);
    const { data } = await api.get(`/chat/${sid}/messages`);
    setMessages(data);
  };

  const newChat = () => { setSessionId(null); setMessages([]); setInput(""); };

  const removeSession = async (sid, e) => {
    e.stopPropagation();
    await api.delete(`/chat/${sid}`);
    if (sid === sessionId) newChat();
    loadSessions();
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    for (const f of files) {
      if (f.size > 8 * 1024 * 1024) { toast.error(`"${f.name}" é demasiado grande (máx 8MB).`); continue; }
      try {
        const fd = new FormData();
        fd.append("file", f);
        const { data } = await api.post("/chat/attachment", fd, { headers: { "Content-Type": "multipart/form-data" } });
        setAttachments((a) => [...a, { id: data.id, kind: data.kind, filename: data.filename }]);
      } catch (err) { toast.error(`Não foi possível anexar "${f.name}".`); }
    }
    setUploading(false);
  };

  const removeAttachment = (id) => setAttachments((a) => a.filter((x) => x.id !== id));

  const send = async (text) => {
    const msg = (text ?? input).trim();
    const atts = attachments;
    if ((!msg && atts.length === 0) || streaming || uploading) return;
    setInput("");
    setAttachments([]);
    const attNote = atts.length ? atts.map((a) => `📎 ${a.filename}`).join("  ") : "";
    const displayContent = (msg + (attNote ? `\n\n${attNote}` : "")).trim();
    setMessages((m) => [...m, { role: "user", content: displayContent }, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      await streamChat(
        { message: msg, session_id: sessionId, attachment_ids: atts.map((a) => a.id) },
        (delta) => setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + delta };
          return copy;
        }),
        (sid) => { if (sid) { setSessionId(sid); loadSessions(); } }
      );
    } catch (e) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: "Desculpa, tive um problema de ligação. Tenta de novo." };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  useEffect(() => {
    const ask = location.state?.ask;
    if (ask) {
      navigate(location.pathname, { replace: true });
      send(ask);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen">
      {/* Sessions panel */}
      <div className="w-[240px] hidden lg:flex flex-col border-r border-border p-4">
        <Button data-testid="new-chat-btn" onClick={newChat} className="rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB] mb-4">
          <Plus className="w-4 h-4 mr-2" /> Nova conversa
        </Button>
        <p className="text-xs text-muted-foreground uppercase tracking-[0.15em] mb-2 px-2">Histórico</p>
        <div className="flex-1 overflow-y-auto space-y-1">
          {sessions.length === 0 && <p className="text-xs text-muted-foreground px-2">Sem conversas ainda.</p>}
          {sessions.map((s) => (
            <div key={s.session_id} onClick={() => openSession(s.session_id)} data-testid={`session-${s.session_id}`}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-colors ${s.session_id === sessionId ? "bg-[#3B82F6]/12 text-[#3B82F6]" : "text-muted-foreground hover:bg-accent"}`}>
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate flex-1">{s.title}</span>
              <button onClick={(e) => removeSession(s.session_id, e)} data-testid={`del-session-${s.session_id}`} className="opacity-0 group-hover:opacity-100 hover:text-[#EF4444] transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col max-w-3xl mx-auto px-6 w-full">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
            <CEOHumanoidReactor size={350} isSpeaking={streaming} amplitude={streaming ? 0.7 : 0} className="mb-2" />
            <h1 className="font-serif-lux text-4xl md:text-5xl mt-4 mb-3">O teu CEO está a ouvir.</h1>
            <p className="text-muted-foreground mb-8 max-w-md">Estou pronto a analisar a tua empresa e a decidir contigo. Expõe a situação — respondo como um sócio experiente, sem termos técnicos.</p>
            <Button data-testid="open-voice-btn" onClick={() => setVoiceOpen(true)}
              className="rounded-full mb-10 h-12 px-7 bg-[#00F0FF]/15 text-[#00F0FF] hover:bg-[#00F0FF]/25 border border-[#00F0FF]/40 text-base shadow-[0_0_20px_rgba(0,240,255,0.2)]">
              <Mic className="w-5 h-5 mr-2 text-[#00F0FF]" /> Falar com o CEO
            </Button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
              {SUGGESTIONS.map((s, i) => (
                <button key={i} data-testid={`suggestion-${i}`} onClick={() => send(s)}
                  className="text-left text-sm p-4 rounded-xl border border-border hover:border-[#00F0FF]/50 hover:bg-accent transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-8 space-y-6">
            {messages.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`msg-${m.role}-${i}`}>
                {m.role === "assistant" && (
                  <div className="w-9 h-9 rounded-full bg-[#00F0FF]/15 border border-[#00F0FF]/30 shrink-0 mr-3 flex items-center justify-center overflow-hidden shadow-[0_0_10px_rgba(0,240,255,0.2)]">
                    <CEOHumanoidReactor size={42} isSpeaking={streaming && i === messages.length - 1} amplitude={0.5} />
                  </div>
                )}
                <div className={`max-w-[80%] px-5 py-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-[#3B82F6] text-white" : "surface"}`}>
                  {m.content || <Loader2 className="w-4 h-4 animate-spin text-[#00F0FF]" />}
                </div>
              </motion.div>
            ))}
            <div ref={endRef} />
          </div>
        )}

        <div className="py-6 sticky bottom-0 bg-background">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3" data-testid="chat-attachments">
              {attachments.map((a) => (
                <div key={a.id} data-testid={`attachment-${a.id}`} className="flex items-center gap-2 text-xs bg-accent border border-border rounded-full pl-3 pr-2 py-1.5">
                  {a.kind === "image" ? <ImageIcon className="w-3.5 h-3.5 text-[#3B82F6]" /> : <FileText className="w-3.5 h-3.5 text-[#3B82F6]" />}
                  <span className="max-w-[160px] truncate">{a.filename}</span>
                  <button onClick={() => removeAttachment(a.id)} data-testid={`remove-attachment-${a.id}`} className="hover:text-[#EF4444]"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 glass rounded-full p-2 pl-4 items-center">
            <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt,.csv,.docx,.xlsx" onChange={handleFiles} className="hidden" data-testid="chat-file-input" />
            <Button data-testid="chat-attach-btn" type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} variant="ghost"
              className="rounded-full w-11 h-11 p-0 text-[#3B82F6] hover:bg-[#3B82F6]/10 shrink-0" title="Anexar foto ou PDF">
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
            </Button>
            <Input data-testid="chat-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escreve a tua pergunta ou anexa um ficheiro..."
              className="border-0 bg-transparent focus-visible:ring-0 shadow-none" />
            <Button data-testid="voice-mic-inline" type="button" onClick={() => setVoiceOpen(true)} variant="ghost"
              className="rounded-full w-11 h-11 p-0 text-[#3B82F6] hover:bg-[#3B82F6]/10" title="Falar com o CEO">
              <Mic className="w-5 h-5" />
            </Button>
            <Button data-testid="chat-send-btn" type="submit" disabled={streaming || uploading || (!input.trim() && attachments.length === 0)}
              className="rounded-full w-11 h-11 p-0 bg-[#3B82F6] text-white hover:bg-[#2563EB]">
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </div>

      <VoiceMode
        open={voiceOpen}
        onClose={() => { setVoiceOpen(false); if (sessionId) openSession(sessionId); loadSessions(); }}
        sessionId={sessionId}
        onSession={setSessionId}
      />
    </div>
  );
}
