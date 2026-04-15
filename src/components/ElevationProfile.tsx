import { useMemo, useState, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ProfilePoint {
  distance: number;
  elevation: number;
  lat: number;
  lon: number;
}

interface Props {
  data: ProfilePoint[];
  onClose: () => void;
  onHoverPoint?: (point: ProfilePoint | null) => void;
}

const PADDING = { top: 20, right: 20, bottom: 35, left: 50 };

export function ElevationProfile({ data, onClose, onHoverPoint }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; point: ProfilePoint } | null>(null);

  const stats = useMemo(() => {
    if (!data.length) return null;
    const elevs = data.map((p) => p.elevation);
    const min = Math.min(...elevs);
    const max = Math.max(...elevs);
    const totalDist = data[data.length - 1].distance;
    let gain = 0, loss = 0;
    for (let i = 1; i < data.length; i++) {
      const diff = data[i].elevation - data[i - 1].elevation;
      if (diff > 0) gain += diff;
      else loss += Math.abs(diff);
    }
    return { min, max, totalDist, gain, loss };
  }, [data]);

  if (!stats) return null;

  const width = 600;
  const height = 200;
  const plotW = width - PADDING.left - PADDING.right;
  const plotH = height - PADDING.top - PADDING.bottom;

  const elevRange = stats.max - stats.min || 1;
  const elevPad = elevRange * 0.1;
  const yMin = stats.min - elevPad;
  const yMax = stats.max + elevPad;

  const toX = (d: number) => PADDING.left + (d / stats.totalDist) * plotW;
  const toY = (e: number) => PADDING.top + plotH - ((e - yMin) / (yMax - yMin)) * plotH;

  const pathD = data
    .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.distance).toFixed(1)},${toY(p.elevation).toFixed(1)}`)
    .join(" ");

  const areaD = `${pathD} L${toX(stats.totalDist).toFixed(1)},${(PADDING.top + plotH).toFixed(1)} L${PADDING.left},${(PADDING.top + plotH).toFixed(1)} Z`;

  const formatDist = (d: number) => (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`);

  const getClosestPoint = (clientX: number): ProfilePoint | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const mouseX = (clientX - rect.left) * scaleX;
    const dist = ((mouseX - PADDING.left) / plotW) * stats.totalDist;
    if (dist < 0 || dist > stats.totalDist) return null;
    let closest = data[0];
    let minDiff = Infinity;
    for (const p of data) {
      const diff = Math.abs(p.distance - dist);
      if (diff < minDiff) { minDiff = diff; closest = p; }
    }
    return closest;
  };

  const handleInteraction = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const mouseX = (clientX - rect.left) * scaleX;
    const closest = getClosestPoint(clientX);
    if (!closest) { setHover(null); onHoverPoint?.(null); return; }
    setHover({ x: mouseX, point: closest });
    onHoverPoint?.(closest);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => handleInteraction(e.clientX);
  
  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 1) {
      e.preventDefault();
      handleInteraction(e.touches[0].clientX);
    }
  };

  const clearHover = () => { setHover(null); onHoverPoint?.(null); };

  const yTicks = 5;
  const xTicks = 5;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-card border-t border-border shadow-lg max-h-[45vh]">
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-muted-foreground flex-wrap min-w-0">
          <span className="font-medium text-foreground text-xs sm:text-sm shrink-0">Profil</span>
          <span>{formatDist(stats.totalDist)}</span>
          <span>D+ {Math.round(stats.gain)}m</span>
          <span>D- {Math.round(stats.loss)}m</span>
          <span className="hidden sm:inline">Min {Math.round(stats.min)}m</span>
          <span className="hidden sm:inline">Max {Math.round(stats.max)}m</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full touch-none"
        style={{ height: "clamp(120px, 20vh, 180px)" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={clearHover}
        onTouchMove={handleTouchMove}
        onTouchEnd={clearHover}
      >
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const val = yMin + (i / yTicks) * (yMax - yMin);
          const y = toY(val);
          return (
            <g key={`y-${i}`}>
              <line x1={PADDING.left} x2={PADDING.left + plotW} y1={y} y2={y} stroke="hsl(var(--border))" strokeWidth={0.5} />
              <text x={PADDING.left - 5} y={y + 3} textAnchor="end" fontSize={9} fill="hsl(var(--muted-foreground))">{Math.round(val)}m</text>
            </g>
          );
        })}
        {Array.from({ length: xTicks + 1 }, (_, i) => {
          const val = (i / xTicks) * stats.totalDist;
          const x = toX(val);
          return (
            <text key={`x-${i}`} x={x} y={PADDING.top + plotH + 15} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">{formatDist(val)}</text>
          );
        })}

        <path d={areaD} fill="hsl(var(--primary) / 0.15)" />
        <path d={pathD} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} />

        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={PADDING.top} y2={PADDING.top + plotH} stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="4,2" />
            <circle cx={toX(hover.point.distance)} cy={toY(hover.point.elevation)} r={4} fill="hsl(var(--primary))" />
            <rect x={hover.x + 5} y={PADDING.top} width={90} height={30} rx={4} fill="hsl(var(--popover))" stroke="hsl(var(--border))" strokeWidth={0.5} />
            <text x={hover.x + 10} y={PADDING.top + 12} fontSize={9} fill="hsl(var(--foreground))">{Math.round(hover.point.elevation)}m</text>
            <text x={hover.x + 10} y={PADDING.top + 24} fontSize={9} fill="hsl(var(--muted-foreground))">{formatDist(hover.point.distance)}</text>
          </>
        )}
      </svg>
    </div>
  );
}
