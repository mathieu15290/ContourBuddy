import { useState } from "react";
import { Layers, Eye, EyeOff, ChevronRight, ChevronLeft } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import type { LayerState, LayerId } from "@/lib/layers";
import { cn } from "@/lib/utils";

interface Props {
  layers: LayerState[];
  onChange: (id: LayerId, patch: Partial<LayerState>) => void;
}

export function LayersPanel({ layers, onChange }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className="absolute top-3 right-3 z-[1000] flex items-start gap-2">
      {open && (
        <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg w-72 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-card/95 backdrop-blur-sm">
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

          <ul className="p-2 space-y-1">
            {layers.map((layer) => (
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
              </li>
            ))}
          </ul>
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
