import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ArrowLeft, Users, Eye, Timer, MousePointerClick, Globe, Smartphone, Monitor, RefreshCw, Radio } from "lucide-react";
import { fetchLiveStats, type LiveStats } from "@/lib/visit-tracker";

import {
  STATS_PERIOD,
  STATS_TOTALS,
  DAILY,
  SOURCES,
  CHANNELS,
  DEVICES,
  COUNTRIES,
  PAGES,
} from "@/lib/stats-data";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

const fmtDuration = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m > 0 ? `${m} min ${r}s` : `${r}s`;
};

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--secondary))",
];

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

const chartTooltip = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
    color: "hsl(var(--foreground))",
  },
  labelStyle: { color: "hsl(var(--foreground))" },
};

const Stats = () => {
  const daily = useMemo(
    () => DAILY.map((d) => ({ ...d, label: fmtDate(d.date) })),
    []
  );

  const env = useMemo(() => {
    if (typeof navigator === "undefined") return null;
    const ua = navigator.userAgent;
    const browser =
      /Edg\//.test(ua) ? "Edge"
      : /OPR\//.test(ua) ? "Opera"
      : /Firefox\//.test(ua) ? "Firefox"
      : /Chrome\//.test(ua) ? "Chrome"
      : /Safari\//.test(ua) ? "Safari"
      : "Autre";
    const os =
      /Android/.test(ua) ? "Android"
      : /iPhone|iPad|iPod/.test(ua) ? "iOS"
      : /Mac OS X/.test(ua) ? "macOS"
      : /Windows/.test(ua) ? "Windows"
      : /Linux/.test(ua) ? "Linux"
      : "Autre";
    return {
      browser,
      os,
      screen: `${window.screen.width}×${window.screen.height} px`,
      viewport: `${window.innerWidth}×${window.innerHeight} px`,
      dpr: String(window.devicePixelRatio),
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      touch: navigator.maxTouchPoints > 0 ? "Oui" : "Non",
    };
  }, []);

  const maxSource = Math.max(...SOURCES.map((s) => s.visitors));
  const maxCountry = Math.max(...COUNTRIES.map((c) => c.visitors));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3 safe-top safe-x">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Retour à la carte
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6 safe-x">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Statistiques d'audience — ContourBuddyApp</h1>
          <p className="text-sm text-muted-foreground">
            Période&nbsp;: {STATS_PERIOD.label} · données anonymes de l'application publiée
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi icon={Users} label="Visiteurs" value={String(STATS_TOTALS.visitors)} hint="visiteurs uniques" />
          <Kpi icon={Eye} label="Pages vues" value={String(STATS_TOTALS.pageviews)} />
          <Kpi
            icon={MousePointerClick}
            label="Pages / visite"
            value={STATS_TOTALS.pageviewsPerVisit.toFixed(2)}
          />
          <Kpi icon={Timer} label="Durée moyenne" value={fmtDuration(STATS_TOTALS.sessionDuration)} />
          <Kpi icon={Globe} label="Taux de rebond" value={`${STATS_TOTALS.bounceRate} %`} hint="visite d'une seule page" />
        </div>

        <Panel title="Fréquentation quotidienne" subtitle="Visiteurs uniques et pages vues par jour">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="gVisitors" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval={3} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip {...chartTooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="visitors"
                  name="Visiteurs"
                  stroke="hsl(var(--primary))"
                  fill="url(#gVisitors)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="pageviews"
                  name="Pages vues"
                  stroke="hsl(var(--accent))"
                  fill="transparent"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="D'où viennent les visiteurs" subtitle="Sites référents et accès direct">
            <ul className="space-y-2">
              {SOURCES.map((s) => (
                <li key={s.name}>
                  <div className="flex justify-between text-sm text-foreground">
                    <span className="truncate">{s.name}</span>
                    <span className="text-muted-foreground tabular-nums ml-2">{s.visitors}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(s.visitors / maxSource) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Canaux d'acquisition" subtitle="Regroupement par type de source">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={CHANNELS}
                    dataKey="visitors"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {CHANNELS.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...chartTooltip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Pays" subtitle="Localisation approximative (IP)">
            <ul className="space-y-2">
              {COUNTRIES.map((c) => (
                <li key={c.code}>
                  <div className="flex justify-between text-sm text-foreground">
                    <span>
                      {c.name} <span className="text-muted-foreground text-xs">({c.code})</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {c.visitors} · {Math.round((c.visitors / STATS_TOTALS.visitors) * 100)} %
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(c.visitors / maxCountry) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Types d'appareils" subtitle="Mobile vs ordinateur">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={DEVICES} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <Tooltip {...chartTooltip} />
                  <Bar dataKey="visitors" name="Visiteurs" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground mt-2">
              <span className="inline-flex items-center gap-1">
                <Smartphone className="h-3.5 w-3.5" /> Mobile {Math.round((DEVICES[0].visitors / STATS_TOTALS.visitors) * 100)} %
              </span>
              <span className="inline-flex items-center gap-1">
                <Monitor className="h-3.5 w-3.5" /> Ordinateur {Math.round((DEVICES[1].visitors / STATS_TOTALS.visitors) * 100)} %
              </span>
            </div>
          </Panel>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Pages consultées">
            <ul className="space-y-2 text-sm">
              {PAGES.map((p) => (
                <li key={p.path} className="flex justify-between">
                  <span className="text-foreground">
                    {p.path} <span className="text-muted-foreground text-xs">— {p.label}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">{p.pageviews}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Votre environnement" subtitle="Détecté sur cet appareil (non collecté, affiché localement)">
            {env && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {[
                  ["Navigateur", env.browser],
                  ["Système", env.os],
                  ["Écran", env.screen],
                  ["Fenêtre", env.viewport],
                  ["Densité de pixels", env.dpr],
                  ["Langue", env.lang],
                  ["Fuseau horaire", env.tz],
                  ["Tactile", env.touch],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-2 border-b border-border/50 pb-1">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-foreground text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Panel>
        </div>

        <p className="text-xs text-muted-foreground">
          Mesure d'audience anonyme et sans cookie&nbsp;: navigateur et système d'exploitation ne sont pas
          enregistrés côté serveur, seuls le type d'appareil, le pays et la source sont disponibles.
          Instantané des données au {new Date(STATS_PERIOD.updatedAt).toLocaleDateString("fr-FR")}.
        </p>
      </main>
    </div>
  );
};

export default Stats;
