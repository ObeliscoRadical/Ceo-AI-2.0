import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setChecking(false); setValid(false); return; }
    api.get("/auth/reset-password/validate", { params: { token } })
      .then((r) => setValid(!!r.data.valid))
      .catch(() => setValid(false))
      .finally(() => setChecking(false));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 4) return toast.error("A senha deve ter pelo menos 4 caracteres");
    if (password !== confirm) return toast.error("As senhas não coincidem");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      toast.success("Senha redefinida com sucesso");
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-foreground relative z-10"
      style={{ background: "radial-gradient(70% 90% at 30% 20%, rgba(59,130,246,0.14), transparent 60%), #05050A" }}>
      <div className="w-full max-w-sm" data-testid="reset-password-page">
        <div className="flex justify-center mb-6">
          <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
            <div className="absolute inset-3 rounded-full" style={{ background: "radial-gradient(circle, rgba(59,130,246,0.4), transparent 70%)", filter: "blur(16px)" }} />
            <img src="/android_cut.png" alt="CEO AI 2.0" className="relative w-full h-full object-contain" />
          </div>
        </div>
        {checking ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#3B82F6]" /></div>
        ) : !valid ? (
          <div className="text-center" data-testid="reset-invalid">
            <h2 className="font-serif-lux text-3xl mb-2">Ligação inválida</h2>
            <p className="text-muted-foreground text-sm mb-6">Esta ligação de redefinição é inválida, expirou ou já foi utilizada. Pede ao administrador um novo email de redefinição.</p>
            <Link to="/login" className="text-[#3B82F6] hover:underline text-sm">Voltar ao início</Link>
          </div>
        ) : done ? (
          <div className="text-center" data-testid="reset-success">
            <ShieldCheck className="w-10 h-10 text-[#10B981] mx-auto mb-3" />
            <h2 className="font-serif-lux text-3xl mb-2">Senha redefinida</h2>
            <p className="text-muted-foreground text-sm">A tua senha foi atualizada. A redirecionar para o início...</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="text-center mb-2">
              <h2 className="font-serif-lux text-3xl mb-1">Definir nova senha</h2>
              <p className="text-muted-foreground text-sm">Escolhe uma nova senha para a tua conta.</p>
            </div>
            <div>
              <label className="text-sm">Nova senha</label>
              <input data-testid="reset-password-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                className="mt-1 w-full rounded-lg bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-[#3B82F6]" placeholder="••••••••" />
            </div>
            <div>
              <label className="text-sm">Confirmar senha</label>
              <input data-testid="reset-confirm-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
                className="mt-1 w-full rounded-lg bg-transparent border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-[#3B82F6]" placeholder="••••••••" />
            </div>
            <button data-testid="reset-submit-btn" type="submit" disabled={loading}
              className="w-full rounded-full bg-[#3B82F6] text-white py-3 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Redefinir senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
