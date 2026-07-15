import { useState, useMemo, useCallback } from "react";
import {
  Layers,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  BookOpen,
  Info,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import type { LayerState, LayerId, LayerSection } from "@/lib/layers";
import { SECTION_META, SECTION_ORDER } from "@/lib/layers";
import { LAYER_LEGENDS, type LegendDef } from "@/lib/layer-legends";
import { cn } from "@/lib/utils";

interface Props {
  layers: LayerState[];
  onChange: (id: LayerId, patch: Partial<LayerState>) => void;
}

// Empêche tout événement pointeur/clavier de fuir vers la carte Leaflet.
const stopMapEvents = {
  onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
  onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
  onWheel: (e: React.WheelEvent) => e.stopPropagation(),
};

function InlineLegend({ def }: { def: LegendDef }) {
  return (
    <div className="mt-2 rounded-md border border-border/60 bg-background/60 p-2">
      {def.source && (
        <div className="text-[10px] text-muted-foreground mb-1.5 leading-tight">
          {def.source}
        </div>
      )}
      <ul className="space-y-1 max-h-48 overflow-y-auto pr-1">
        {def.entries.map((e, i) => (
          <li key={i} className="flex items-center gap-2 text-[11px] text-foreground/90">
            {e.pattern === "line" ? (
              <span
                className="inline-block w-3 h-[2px] rounded-sm shrink-0"
                style={{ background: e.color }}
              />
            ) : (
              <span
                className="inline-block w-3 h-2 rounded-sm border border-border/50 shrink-0"
                style={{ background: e.color }}
              />
            )}
            <span className="truncate">{e.label}</span>
          </li>
        ))}
      </ul>
      {def.footer && (
        <a
          href={def.footer.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[11px] text-primary hover:underline"
        >
          {def.footer.label} ↗
        </a>
      )}
    </div>
  );
}

function LayerRow({
  layer,
  onChange,
}: {
  layer: LayerState;
  onChange: (id: LayerId, patch: Partial<LayerState>) => void;
}) {
  const [legendOpen, setLegendOpen] = useState(false);
  const legend = LAYER_LEGENDS[layer.id];

  if (layer.unavailable) {
    return (
      <li className="rounded-md border border-dashed border-border/60 px-2 py-2 opacity-70">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">{layer.label}</span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground pl-6">{layer.unavailable}</p>
      </li>
    );
  }

  return (
    <li
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

      {legend && (
        <>
          <button
            onClick={() => setLegendOpen((v) => !v)}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <BookOpen className="h-3 w-3" />
            <span>
              Légende{legend.entries.length ? ` (${legend.entries.length})` : ""}
            </span>
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                legendOpen && "rotate-180"
              )}
            />
          </button>
          {legendOpen && <InlineLegend def={legend} />}
        </>
      )}
    </li>
  );
}

function SectionBlock({
  section,
  items,
  onChange,
}: {
  section: LayerSection;
  items: LayerState[];
  onChange: (id: LayerId, patch: Partial<LayerState>) => void;
}) {
  const [open, setOpen] = useState(true);
  const meta = SECTION_META[section];
  const visibleCount = items.filter((l) => l.visible).length;

  return (
    <section className="border border-border/60 rounded-md">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/40 rounded-md"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-sm">{meta.emoji}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground/80 flex-1">
          {meta.label}
        </span>
        <span
          className={cn(
            "text-[10px] tabular-nums px-1.5 py-0.5 rounded-full",
            visibleCount > 0
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          {visibleCount} / {items.length}
        </span>
      </button>
      {open && (
        <ul className="p-2 pt-1 space-y-1">
          {items.map((layer) => (
            <LayerRow key={layer.id} layer={layer} onChange={onChange} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function LayersPanel({ layers, onChange }: Props) {
  const [open, setOpen] = useState(true);

  const grouped = useMemo(() => {
    const map = new Map<LayerSection, LayerState[]>();
    for (const s of SECTION_ORDER) map.set(s, []);
    for (const l of layers) {
      const arr = map.get(l.section) ?? [];
      arr.push(l);
      map.set(l.section, arr);
    }
    return map;
  }, [layers]);

  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);

  return (
    <div
      className="absolute top-3 right-3 z-[5000] flex items-start gap-2"
      {...stopMapEvents}
    >
      {open && (
        <div
          className="bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg w-72 max-h-[70vh] overflow-y-auto"
          onScroll={stop}
        >
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

          <div className="p-2 space-y-2">
            {SECTION_ORDER.map((section) => {
              const items = grouped.get(section) ?? [];
              if (!items.length) return null;
              return (
                <SectionBlock
                  key={section}
                  section={section}
                  items={items}
                  onChange={onChange}
                />
              );
            })}
          </div>
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
