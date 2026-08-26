import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "cb_session_id";
const SESSION_TS_KEY = "cb_session_ts";
const SESSION_TTL = 30 * 60 * 1000; // 30 min d'inactivité = nouvelle session

function getSessionId(): string {
  try {
    const now = Date.now();
    const ts = Number(sessionStorage.getItem(SESSION_TS_KEY) || 0);
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id || now - ts > SESSION_TTL) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    sessionStorage.setItem(SESSION_TS_KEY, String(now));
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function detectEnv() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Autre";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "Autre";
  const device =
    /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))
      ? "Tablette"
      : /Mobi|Android|iPhone/.test(ua)
        ? "Mobile"
        : "Ordinateur";
  return { browser, os, device };
}

function referrerHost(): string {
  try {
    if (!document.referrer) return "";
    const h = new URL(document.referrer).hostname;
    return h === location.hostname ? "" : h;
  } catch {
    return "";
  }
}

let lastPath: string | null = null;

/** Enregistre une page vue anonyme (aucune donnée personnelle). */
export async function trackPageView(path: string) {
  if (path === lastPath) return;
  lastPath = path;
  const { browser, os, device } = detectEnv();
  try {
    await supabase.from("site_visits").insert({
      session_id: getSessionId(),
      path,
      device,
      browser,
      os,
      lang: navigator.language,
      referrer_host: referrerHost(),
    });
  } catch {
    /* la mesure d'audience ne doit jamais casser l'app */
  }
}

export type LiveStats = {
  days: number;
  generated_at: string;
  totals: { visitors: number; pageviews: number };
  daily: { date: string; visitors: number; pageviews: number }[];
  devices: { name: string; visitors: number }[];
  browsers: { name: string; visitors: number }[];
  systems: { name: string; visitors: number }[];
  languages: { name: string; visitors: number }[];
  sources: { name: string; visitors: number }[];
  pages: { path: string; pageviews: number }[];
};

export async function fetchLiveStats(days = 30): Promise<LiveStats | null> {
  const { data, error } = await supabase.rpc("site_visit_stats", { _days: days });
  if (error) {
    console.error("site_visit_stats:", error.message);
    return null;
  }
  return data as unknown as LiveStats;
}
