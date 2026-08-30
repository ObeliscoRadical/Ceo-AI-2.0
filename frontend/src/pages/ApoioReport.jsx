import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Loader2, Printer, ArrowLeft, CheckCircle2, Circle, FileText } from "lucide-react";

const DEADLINE_TEXT = { continuo: "Candidaturas em contínuo", consultar_aviso: "Depende de aviso oficial (verificar no site)" };

export default function ApoioReport() {
  const navigate = useNavigate();
  const { aid } = useParams();
  const [d, setD] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get(`/grants/applications/${aid}`).then(({ data }) => setD(data)).catch(() => setFailed(true));
  }, [aid]);

  if (failed) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white text-gray-700 gap-4 px-6 text-center">
      <p>Não foi possível carregar esta candidatura.</p>
      <button onClick={() => navigate("/apoios")} className="text-blue-600 underline">Voltar aos apoios</button>
    </div>
  );
  if (!d) return <div className="min-h-screen flex items-center justify-center bg-white"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;

  const a = d.application; const g = d.grant || {};
  const today = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
  const catalogDeadline = DEADLINE_TEXT[g.deadline] || (g.deadline ? `Prazo indicativo: ${g.deadline}` : "—");

  const List = ({ items }) => (
    <ul className="space-y-1.5">
      {(items || []).map((it, i) => (
        <li key={i} className="flex gap-2 text-sm text-gray-800">
          {it.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <Circle className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />}
          <span className={it.done ? "line-through text-gray-400" : ""}>{it.label}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="report-root min-h-screen bg-gray-100 py-10 print:py-0 print:bg-white">
      <div data-print-hide className="max-w-[794px] mx-auto mb-4 flex items-center justify-between px-2">
        <button onClick={() => navigate("/apoios")} data-testid="apoio-report-back" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <button onClick={() => window.print()} data-testid="apoio-report-print" className="inline-flex items-center gap-2 text-sm font-medium bg-blue-600 text-white rounded-full px-5 py-2.5 hover:bg-blue-700">
          <Printer className="w-4 h-4" /> Imprimir / Guardar PDF
        </button>
      </div>

      <div className="report-sheet bg-white text-gray-900 mx-auto shadow-xl print:shadow-none" style={{ width: "794px", maxWidth: "100%", padding: "48px 56px" }}>
        <div className="flex items-center justify-between border-b border-gray-200 pb-5 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold">C</div>
            <div>
              <div className="text-lg font-bold leading-none">CEO AI 2.0</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500 mt-1">Diretor Executivo Digital</div>
            </div>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div>Resumo de Candidatura a Apoio</div>
            <div>{today}</div>
          </div>
        </div>

        <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">{d.company_name} · {a.type_label}</div>
        <h1 className="text-2xl font-bold mb-1">{a.title}</h1>
        <p className="text-gray-500 mb-8">{a.entity}</p>

        {/* Info principal */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Estado</div>
            <div className="text-base font-semibold text-blue-700">{a.status_label}</div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Prazo de submissão definido</div>
            <div className="text-base font-semibold">{a.deadline || "Por definir"}</div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Montante / Taxa</div>
            <div className="text-sm">{g.amount || "—"}</div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Prazo oficial do programa</div>
            <div className="text-sm">{catalogDeadline}</div>
          </div>
        </div>

        {g.expenses && (
          <div style={{ breakInside: "avoid" }} className="mb-8">
            <h2 className="text-lg font-bold mb-2">Despesas elegíveis</h2>
            <p className="text-sm text-gray-700 leading-relaxed">{g.expenses}</p>
          </div>
        )}

        {/* Passos */}
        <div style={{ breakInside: "avoid" }} className="mb-8">
          <h2 className="text-lg font-bold mb-3">Passos da candidatura</h2>
          <List items={a.steps} />
        </div>

        {/* Documentos exigidos */}
        <div style={{ breakInside: "avoid" }} className="mb-8">
          <h2 className="text-lg font-bold mb-3">Documentos exigidos</h2>
          <List items={a.checklist} />
        </div>

        {/* Documentos anexados */}
        {(a.files || []).length > 0 && (
          <div style={{ breakInside: "avoid" }} className="mb-8">
            <h2 className="text-lg font-bold mb-3">Documentos anexados</h2>
            <ul className="space-y-1.5">
              {a.files.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-800"><FileText className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />{f.filename}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Notas */}
        {a.notes && (
          <div style={{ breakInside: "avoid" }} className="mb-8">
            <h2 className="text-lg font-bold mb-2">Notas</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{a.notes}</p>
          </div>
        )}

        <div className="border-t border-gray-200 pt-4 text-[11px] text-gray-400 leading-relaxed">
          A elegibilidade é uma estimativa com base no perfil da empresa e não garante aprovação. Confirma sempre requisitos, montantes e prazos na fonte oficial do programa. Este resumo não constitui aconselhamento legal ou fiscal. Fonte da base curada verificada a {g.verified_at || "—"}. Gerado pelo CEO AI 2.0 em {today}.
        </div>
      </div>
    </div>
  );
}
