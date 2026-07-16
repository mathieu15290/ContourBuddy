import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CloudRain, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MonthlyRow {
  month: number;
  rrTotal: number;
  tMean: number | null;
  tMin: number | null;
  tMax: number | null;
  gelDays: number;
  yearsUsed: number;
}
interface ClimateData {
  station: { id: string; nom: string; lat: number; lon: number; alti: number | null };
  distanceKm: number;
  period: { startYear: number; endYear: number; yearsRequested: number; yearsUsed: number };
  monthly: MonthlyRow[];
  annual: { rrTotal: number; tMean: number; gelDays: number };
  cached?: boolean;
  cacheReason?: string;
}

function avg(nums: (number | null)[]): number | null {
  const v = nums.filter((n): n is number => n != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

const MONTHS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const MONTHS_INIT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function classifyRr(mm: number): { label: string; bg: string } {
  if (mm < 30) return { label: "Très sec", bg: "bg-topo-brown-dark" };
  if (mm < 60) return { label: "Sec", bg: "bg-topo-brown" };
  if (mm < 100) return { label: "Normal", bg: "bg-topo-brown-light" };
  if (mm < 150) return { label: "Humide", bg: "bg-topo-blue-light" };
  return { label: "Très humide", bg: "bg-topo-blue" };
}

interface Props { lat: number; lon: number; }

export function ClimateCard({ lat, lon }: Props) {
  const [data, setData] = useState<ClimateData | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("meteo-climate", { body: { lat, lon } });
      if (error) throw error;
      if ((res as { error?: string })?.error) throw new Error((res as { error: string }).error);
      setData(res as ClimateData);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      toast({ title: "Données climat indisponibles", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const maxRr = data ? Math.max(...data.monthly.map(m => m.rrTotal), 1) : 1;
  const avgRr = data ? data.monthly.reduce((a, b) => a + b.rrTotal, 0) / 12 : 0;
  const avgPct = maxRr > 0 ? (avgRr / maxRr) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CloudRain className="h-4 w-4 text-topo-blue" />
          Climat (Météo-France)
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Données issues des normales climatiques de Météo-France (station SYNOP la plus proche).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!data && !loading && (
          <Button onClick={load} className="w-full" size="sm">
            <CloudRain className="h-4 w-4" />
            Charger les normales locales
          </Button>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Calcul des normales 30 ans…
          </div>
        )}

        {data && !loading && (
          <>
            <p className="text-xs text-foreground">
              Station <span className="font-semibold">{data.station.nom}</span>
              {data.station.alti != null && <> ({Math.round(data.station.alti)} m)</>}
              {" — à "}{data.distanceKm} km · moyenne {data.period.startYear}–{data.period.endYear}
              {data.period.yearsUsed < data.period.yearsRequested && (
                <span className="text-muted-foreground"> ({data.period.yearsUsed}/{data.period.yearsRequested} ans)</span>
              )}
            </p>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-muted rounded-md p-2 text-center">
                <p className="text-muted-foreground text-[10px]">Temp. moy.</p>
                <p className="font-semibold">{data.annual.tMean.toFixed(1)}°C</p>
              </div>
              <div className="bg-muted rounded-md p-2 text-center">
                <p className="text-muted-foreground text-[10px]">Pluvio</p>
                <p className="font-semibold">{Math.round(data.annual.rrTotal)} mm</p>
              </div>
              <div className="bg-muted rounded-md p-2 text-center">
                <p className="text-muted-foreground text-[10px]">T. min moy.</p>
                <p className="font-semibold text-topo-blue">
                  {(() => { const v = avg(data.monthly.map(m => m.tMin)); return v != null ? `${v.toFixed(1)}°C` : "—"; })()}
                </p>
              </div>
              <div className="bg-muted rounded-md p-2 text-center">
                <p className="text-muted-foreground text-[10px]">T. max moy.</p>
                <p className="font-semibold text-topo-brown-dark">
                  {(() => { const v = avg(data.monthly.map(m => m.tMax)); return v != null ? `${v.toFixed(1)}°C` : "—"; })()}
                </p>
              </div>
              <div className="bg-muted rounded-md p-2 text-center col-span-2">
                <p className="text-muted-foreground text-[10px]">Jours de gel / an</p>
                <p className="font-semibold">{data.annual.gelDays}</p>
              </div>
            </div>

            <div className="pt-1">
              <TooltipProvider delayDuration={100}>
                <div className="relative h-24 flex items-end gap-[3px] border-b border-border">
                  <div
                    className="absolute left-0 right-0 border-t border-dashed border-muted-foreground/60 pointer-events-none"
                    style={{ bottom: `${avgPct}%` }}
                    title={`Moyenne mensuelle ${avgRr.toFixed(1)} mm`}
                  />
                  {data.monthly.map((m) => {
                    const h = (m.rrTotal / maxRr) * 100;
                    const cls = classifyRr(m.rrTotal);
                    return (
                      <Tooltip key={m.month}>
                        <TooltipTrigger asChild>
                          <div
                            className={`flex-1 rounded-t-sm cursor-pointer ${cls.bg} hover:opacity-80 transition-opacity`}
                            style={{ height: `${Math.max(h, 2)}%` }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <p className="font-semibold">{MONTHS_FR[m.month - 1]}</p>
                          <p>{m.rrTotal.toFixed(1)} mm — {cls.label}</p>
                          {m.tMean != null && <p>T. moy. {m.tMean.toFixed(1)}°C</p>}
                          {(m.tMin != null || m.tMax != null) && (
                            <p>
                              {m.tMin != null && <>min {m.tMin.toFixed(1)}°C</>}
                              {m.tMin != null && m.tMax != null && " · "}
                              {m.tMax != null && <>max {m.tMax.toFixed(1)}°C</>}
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
              <div className="flex gap-[3px] mt-1">
                {MONTHS_INIT.map((l, i) => (
                  <div key={i} className="flex-1 text-center text-[10px] text-muted-foreground">{l}</div>
                ))}
              </div>
            </div>

            <div className="space-y-1 text-[11px]">
              {[
                { label: "< 30 mm — Très sec", bg: "bg-topo-brown-dark" },
                { label: "30–60 mm — Sec", bg: "bg-topo-brown" },
                { label: "60–100 mm — Normal", bg: "bg-topo-brown-light" },
                { label: "100–150 mm — Humide", bg: "bg-topo-blue-light" },
                { label: "≥ 150 mm — Très humide", bg: "bg-topo-blue" },
              ].map((c) => (
                <div key={c.label} className="flex items-center gap-2">
                  <span className={`inline-block h-3 w-3 rounded-sm ${c.bg}`} />
                  <span className="text-muted-foreground">{c.label}</span>
                </div>
              ))}
            </div>

            <Button onClick={load} variant="outline" size="sm" className="w-full">
              <RefreshCw className="h-4 w-4" />
              Actualiser
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
