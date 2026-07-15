import { useState, useMemo } from "react";
import { Layers, Eye, EyeOff, ChevronRight, ChevronLeft, Info } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { LayerState, LayerId, LayerGroup } from "@/lib/layers";
import { LAYER_GROUP_LABELS } from "@/lib/layers";
import { SLOPE_LEGEND, ASPECT_LEGEND } from "@/lib/terrain";
import { cn } from "@/lib/utils";

interface Props {
  layers: LayerState[];
  onChange: (id: LayerId, patch: Partial<LayerState>) => void;
}

const GROUP_ORDER: LayerGroup[] = ["base", "terrain", "environment"];

export function LayersPanel({ layers, onChange }: Props) {
  const [open, setOpen] = useState(true);

  const grouped = useMemo(() => {
    const map: Record<LayerGroup, LayerState[]> = { base: [], terrain: [], environment: [] };
    for (const l of layers) map[l.group ?? "terrain"].push(l);
    return map;
  }, [layers]);

  return (
    <div className="absolute top-3 right-3 z-[1000] flex items-start gap-2">
      {open && (
        <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg w-72 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-card/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Calques</h3>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
              title="Réduire"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {GROUP_ORDER.map((group) => {
            const items = grouped[group];
            if (!items.length) return null;
            return (
              <section key={group} className="border-b border-border/60 last:border-b-0">
                <h4 className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {LAYER_GROUP_LABELS[group]}
                </h4>
                <ul className="p-2 pt-1 space-y-1">
                  {items.map((layer) => (
                    <li
                      key={layer.id}
                      className={cn(
                        "rounded-md border border-transparent px-2 py-2 transition-colors",
                        layer.visible ? "bg-muted/40" : "opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onChange(layer.id, { visible: !layer.visible })}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          title={layer.visible ? "Masquer" : "Afficher"}
                        >
                          {layer.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
                        <span className="text-sm text-foreground flex-1 truncate">{layer.label}</span>
                        {layer.source && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                className="text-muted-foreground hover:text-foreground shrink-0"
                                title="Source"
                                aria-label={`Source ${layer.source.provider}`}
                              >
                                <Info className="h-3.5 w-3.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent side="left" className="w-60 text-xs">
                              <div className="font-semibold text-foreground mb-1">{layer.label}</div>
                              <div className="text-muted-foreground">
                                Source&nbsp;: <span className="font-medium text-foreground">{layer.source.provider}</span> — {layer.source.label}
                              </div>
                              <a
                                href={layer.source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-block text-primary hover:underline"
                              >
                                En savoir plus →
                              </a>
                            </PopoverContent>
                          </Popover>
                        )}
                        {!layer.noOpacity && layer.visible && (
                          <span className="text-xs text-muted-foreground tabular-nums w-9 text-right">
                            {Math.round(layer.opacity * 100)}%
                          </span>
                        )}
                      </div>
                      {!layer.noOpacity && layer.visible && (
                        <div className="mt-2 px-1">
                          <Slider
                            value={[Math.round(layer.opacity * 100)]}
                            min={0}
                            max={100}
                            step={5}
                            onValueChange={(v) => onChange(layer.id, { opacity: v[0] / 100 })}
                          />
                        </div>
                      )}
                      {layer.visible && layer.id === "slope" && (
                        <ul className="mt-2 pl-1 space-y-0.5">
                          {SLOPE_LEGEND.map((row) => (
                            <li key={row.label} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span
                                className="inline-block w-3 h-3 rounded-sm border border-border/50 shrink-0"
                                style={{ background: row.color }}
                              />
                              <span className="truncate">{row.label}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {layer.visible && layer.id === "aspect" && (
                        <ul className="mt-2 pl-1 flex flex-wrap gap-x-3 gap-y-1">
                          {ASPECT_LEGEND.map((row) => (
                            <li key={row.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span
                                className="inline-block w-3 h-3 rounded-full border border-border/50"
                                style={{ background: row.color }}
                              />
                              <span>{row.label}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-2 hover:bg-muted text-foreground flex items-center gap-1.5"
          title="Gestion des calques"
        >
          <ChevronLeft className="h-4 w-4" />
          <Layers className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
