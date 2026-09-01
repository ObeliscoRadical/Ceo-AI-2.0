import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, RefreshCw, Layers, Instagram, Facebook, Tag, Sparkles, MoveRight } from "lucide-react";
import { toast } from "sonner";

export const InteractiveCalendarSection = ({ calendarData = {}, onRefresh, api }) => {
  const [view, setView] = useState(calendarData.view || "semana");
  const slots = calendarData.slots || [];
  const [movingSlotId, setMovingSlotId] = useState(null);

  const handleMoveSlotQuick = async (slotId, hoursToAdd) => {
    const slot = slots.find(s => s.id === slotId);
    if (!slot) return;
    const currentDt = new Date(slot.scheduled_at);
    currentDt.setHours(currentDt.getHours() + hoursToAdd);
    
    try {
      await api.post("/marketing/scheduler/move-slot", {
        slot_id: slotId,
        target_time: currentDt.toISOString()
      });
      toast.success(`Slot reagendado para ${currentDt.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}!`);
      onRefresh();
    } catch (e) {
      toast.error("Erro ao reagendar slot.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Calendar className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">Calendário Operacional com Drag-and-Drop</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Grade visual de publicações em tempo real conectada diretamente ao scheduler de servidor.
          </p>
        </div>

        <div className="flex gap-2">
          {["hoje", "semana", "mes"].map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? "default" : "outline"}
              onClick={() => setView(v)}
              className={`rounded-xl text-xs uppercase font-bold ${
                view === v ? "bg-purple-600 text-white" : "border-white/10 text-slate-300 hover:bg-white/5"
              }`}
            >
              {v}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={onRefresh} className="h-8 w-8 p-0 text-slate-400 hover:text-white">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Grid de Slots */}
      {slots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-12 text-center">
          <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-white">Nenhum post agendado para este período</h3>
          <p className="text-sm text-slate-400 mt-1">
            Aceda ao módulo de "Postagens & Distribuição" para preencher automaticamente os horários com base no seu Content Pool.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {slots.map((slot) => {
            const dt = new Date(slot.scheduled_at);
            const timeStr = dt.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
            const dateStr = dt.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short" });

            return (
              <div
                key={slot.id}
                className="p-4 rounded-2xl border border-white/10 bg-[#0B0F17] flex items-center justify-between gap-4 hover:border-purple-500/30 transition-all shadow-md group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-center min-w-[70px]">
                    <span className="text-xs uppercase font-bold text-purple-400 block">{dateStr}</span>
                    <span className="text-sm font-black text-white block mt-0.5">{timeStr}</span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        {slot.network || "Instagram"} · {slot.format || "Post"} (Var {slot.variant_type || "A"})
                      </span>
                      {slot.product_name && (
                        <span className="text-[11px] text-slate-400 bg-white/5 px-2 py-0.5 rounded truncate">
                          📦 {slot.product_name}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-bold text-white truncate">{slot.title}</h4>
                    {slot.hook && <p className="text-xs text-slate-300 truncate mt-0.5">"{slot.hook}"</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    {slot.status}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMoveSlotQuick(slot.id, 2)}
                    className="h-8 rounded-xl border-white/10 text-xs text-slate-300 hover:bg-white/5"
                    title="Avançar 2 horas"
                  >
                    +2h <MoveRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
