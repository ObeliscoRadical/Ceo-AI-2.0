import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, Download, Expand, Image as ImageIcon, Loader2, RefreshCw } from "lucide-react";

export const resolveImageUrl = (url) => {
  if (!url || typeof url !== "string") return "";
  if (url.includes("localhost:3000/api/")) {
    return url.replace("http://localhost:3000/api/", "http://localhost:8001/api/");
  }
  if (url.startsWith("/api/")) {
    return `http://localhost:8001${url}`;
  }
  return url;
};

export const PostImageVariantSelector = ({ post, index, busyKey, onGenerate, onSelectVariant, onDownloadSelected }) => {
  const variants = post?.image_variants || [];
  const selectedIndex = typeof post?.selected_image_index === "number" ? post.selected_image_index : (variants.length > 0 ? 0 : null);
  const rawSelectedUrl = post?.image_url || (selectedIndex !== null ? variants[selectedIndex] : null);
  const selectedUrl = resolveImageUrl(rawSelectedUrl);
  const [previewIndex, setPreviewIndex] = useState(null);

  const previewUrl = useMemo(() => {
    if (previewIndex === null || previewIndex < 0 || previewIndex >= variants.length) return null;
    return resolveImageUrl(variants[previewIndex]);
  }, [previewIndex, variants]);

  const isGenerating = busyKey === `generate-${index}`;
  const isSelecting = (variantIndex) => busyKey === `select-${post?.id}-${variantIndex}`;

  if (!selectedUrl) {
    return (
      <div className="space-y-3 mb-4" data-testid={`mkt-image-selector-${index}`}>
        <button
          onClick={() => onGenerate(index)}
          disabled={isGenerating}
          data-testid={`mkt-genimg-${index}`}
          className="w-full aspect-square rounded-2xl border border-dashed border-white/15 flex flex-col items-center justify-center gap-2 hover:bg-white/[0.03] transition-colors disabled:opacity-60"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin text-[#A78BFA]" />
              <span className="text-xs text-muted-foreground">A criar 3 imagens de alta resolução…</span>
            </>
          ) : (
            <>
              <ImageIcon className="w-6 h-6 text-[#A78BFA]" />
              <span className="text-xs text-muted-foreground">Gerar 3 imagens (com o seu logo)</span>
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 mb-4" data-testid={`mkt-image-selector-${index}`}>
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-slate-900 border border-white/10">
        <img 
          src={selectedUrl} 
          alt={post?.titulo} 
          className="w-full h-full object-cover rounded-2xl" 
          data-testid={`mkt-img-${index}`} 
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap" data-testid={`mkt-image-selector-toolbar-${index}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground" data-testid={`mkt-image-selector-count-${index}`}>
            {variants.length} {variants.length === 1 ? "opção" : "opções"}
          </span>
          {selectedIndex !== null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300" data-testid={`mkt-image-selector-selected-${index}`}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Selecionada a opção {selectedIndex + 1}
            </span>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button data-testid={`mkt-regenimg-${index}`} onClick={() => onGenerate(index)} disabled={isGenerating} variant="outline" size="sm" className="rounded-full border-white/15 hover:bg-white/5">
            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Gerar novas imagens
          </Button>
          <Button data-testid={`mkt-download-${index}`} onClick={() => onDownloadSelected(selectedUrl, index)} size="sm" className="rounded-full bg-[#A78BFA] text-white hover:bg-[#9333EA]">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Guardar imagem
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3" data-testid={`mkt-image-variants-${index}`}>
        {variants.map((rawUrl, variantIndex) => {
          const url = resolveImageUrl(rawUrl);
          const selected = variantIndex === selectedIndex;
          return (
            <button
              type="button"
              key={`${url}-${variantIndex}`}
              onClick={() => setPreviewIndex(variantIndex)}
              className={`rounded-[18px] border p-2 text-left transition-colors ${selected ? "border-[#10B981] bg-[#10B981]/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"}`}
              data-testid={`mkt-image-variant-${index}-${variantIndex}`}
            >
              <div className="relative w-full aspect-square rounded-[14px] overflow-hidden bg-slate-900 mb-2">
                <img 
                  src={url} 
                  alt={`${post?.titulo} variante ${variantIndex + 1}`} 
                  className="w-full h-full object-cover rounded-[14px]" 
                  data-testid={`mkt-image-variant-img-${index}-${variantIndex}`} 
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground" data-testid={`mkt-image-variant-label-${index}-${variantIndex}`}>Opção {variantIndex + 1}</span>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-200" data-testid={`mkt-image-variant-preview-${index}-${variantIndex}`}>
                  <Expand className="w-3.5 h-3.5" /> Ampliar
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={previewIndex !== null} onOpenChange={(open) => !open && setPreviewIndex(null)}>
        <DialogContent data-testid={`mkt-image-preview-dialog-${index}`} className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Escolher imagem do post</DialogTitle>
            <DialogDescription>
              Amplia a imagem e seleciona a melhor opção antes de aprovar o conteúdo.
            </DialogDescription>
          </DialogHeader>

          {previewUrl && (
            <div className="space-y-4" data-testid={`mkt-image-preview-body-${index}`}>
              <img src={previewUrl} alt={`${post?.titulo} ampliada`} className="w-full max-h-[70vh] object-contain rounded-2xl border border-white/10 bg-black/20" data-testid={`mkt-image-preview-img-${index}`} />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground" data-testid={`mkt-image-preview-label-${index}`}>
                  Opção {(previewIndex ?? 0) + 1} de {variants.length}
                </span>
                <Button
                  data-testid={`mkt-image-preview-select-${index}`}
                  onClick={async () => {
                    await onSelectVariant(post?.id, previewIndex);
                    setPreviewIndex(null);
                  }}
                  disabled={previewIndex === null || isSelecting(previewIndex)}
                  className="rounded-full bg-emerald-500 text-white hover:bg-emerald-600"
                >
                  {previewIndex !== null && isSelecting(previewIndex) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Escolher esta imagem
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewIndex(null)} className="rounded-full border-white/15 hover:bg-white/5" data-testid={`mkt-image-preview-close-${index}`}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};