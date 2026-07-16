import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CACHE_TTL_DAYS = 60;
const DATA_GOUV_DATASET = 'donnees-climatologiques-de-base-mensuelles';
const WINDOW_END = 2024;
const WINDOW_YEARS = 30;
const WINDOW_START = WINDOW_END - WINDOW_YEARS + 1;

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const deptCsvCache = new Map<string, string>();

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371, toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function inseeToDept(c: string) {
  if (c.startsWith('97') || c.startsWith('98')) return c.slice(0, 3);
  if (c.startsWith('2A') || c.startsWith('2B')) return c.slice(0, 2);
  return c.slice(0, 2);
}
async function reverseGeocodeDept(lat: number, lon: number): Promise<string> {
  try {
    const r = await fetch(`https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lon}&fields=codeDepartement,code&format=json&geometry=centre`);
    if (r.ok) { const d = await r.json(); if (d?.[0]?.codeDepartement) return d[0].codeDepartement; if (d?.[0]?.code) return inseeToDept(d[0].code); }
  } catch { /* noop */ }
  try {
    const r = await fetch(`https://data.geopf.fr/geocodage/reverse?lon=${lon}&lat=${lat}&limit=1&index=address`);
    if (r.ok) { const d = await r.json(); const p = d?.features?.[0]?.properties; if (p?.citycode) return inseeToDept(p.citycode); if (p?.departmentcode) return p.departmentcode; }
  } catch { /* noop */ }
  try {
    const r = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}&limit=1`);
    if (r.ok) { const d = await r.json(); const c = d?.features?.[0]?.properties?.citycode; if (c) return inseeToDept(c); }
  } catch { /* noop */ }
  throw new Error('département introuvable pour ces coordonnées');
}
async function findDeptResourceUrl(dept: string) {
  const padded = dept.length === 1 ? `0${dept}` : dept;
  for (const fname of [`MENSQ_${padded}_previous-1950-2024.csv.gz`, `MENSQ_${dept}_previous-1950-2024.csv.gz`]) {
    const url = `https://object.files.data.gouv.fr/meteofrance/data/synchro_ftp/BASE/MENS/${fname}`;
    if ((await fetch(url, { method: 'HEAD' })).ok) return url;
  }
  const api = `https://www.data.gouv.fr/api/2/datasets/${DATA_GOUV_DATASET}/resources/?q=${encodeURIComponent(`MENS_departement_${padded}_periode_1950-2024`)}&page_size=5`;
  const r = await fetch(api); if (!r.ok) throw new Error(`data.gouv.fr API ${r.status}`);
  const url = (await r.json())?.data?.[0]?.url; if (!url) throw new Error(`aucun CSV pour dept ${dept}`);
  return url;
}
async function fetchDeptCsv(dept: string) {
  const hit = deptCsvCache.get(dept); if (hit) return hit;
  const res = await fetch(await findDeptResourceUrl(dept));
  if (!res.ok || !res.body) throw new Error(`téléchargement CSV échoué (${res.status})`);
  const text = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
  if (deptCsvCache.size >= 10) deptCsvCache.delete(deptCsvCache.keys().next().value as string);
  deptCsvCache.set(dept, text); return text;
}

interface StationAgg {
  id: string; nom: string; lat: number; lon: number; alti: number | null;
  rr: number[][]; tm: number[][]; tn: number[][]; tx: number[][]; gel: number[][];
}

function parseAndIndex(csv: string): Map<string, StationAgg> {
  const stations = new Map<string, StationAgg>();
  const lines = csv.split('\n'); if (lines.length < 2) return stations;
  const header = lines[0].split(';'); const idx = (n: string) => header.indexOf(n);
  const I_NUM = idx('NUM_POSTE'), I_NOM = idx('NOM_USUEL'), I_LAT = idx('LAT'), I_LON = idx('LON'),
    I_ALT = idx('ALTI'), I_YM = idx('AAAAMM'),
    I_RR = idx('RR'), I_TM = idx('TM'), I_TN = idx('TN'), I_TX = idx('TX'), I_GEL = idx('NBJGELEE');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]; if (!line) continue;
    const c = line.split(';'); const ym = c[I_YM]; if (!ym || ym.length < 6) continue;
    const year = +ym.slice(0, 4); if (year < WINDOW_START || year > WINDOW_END) continue;
    const month = +ym.slice(4, 6) - 1; if (month < 0 || month > 11) continue;
    const id = c[I_NUM]; if (!id) continue;
    let s = stations.get(id);
    if (!s) {
      const lat = parseFloat(c[I_LAT]), lon = parseFloat(c[I_LON]);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      s = {
        id, nom: c[I_NOM] || id, lat, lon, alti: c[I_ALT] ? parseFloat(c[I_ALT]) : null,
        rr: Array.from({ length: 12 }, () => []), tm: Array.from({ length: 12 }, () => []),
        tn: Array.from({ length: 12 }, () => []), tx: Array.from({ length: 12 }, () => []),
        gel: Array.from({ length: 12 }, () => []),
      };
      stations.set(id, s);
    }
    const num = (r: string) => { if (!r) return; const n = parseFloat(r); return isFinite(n) ? n : undefined; };
    const rr = num(c[I_RR]), tm = num(c[I_TM]), tn = num(c[I_TN]), tx = num(c[I_TX]), gel = num(c[I_GEL]);
    if (rr !== undefined) s.rr[month].push(rr);
    if (tm !== undefined) s.tm[month].push(tm);
    if (tn !== undefined) s.tn[month].push(tn);
    if (tx !== undefined) s.tx[month].push(tx);
    if (gel !== undefined) s.gel[month].push(gel);
  }
  return stations;
}

const mean = (a: number[]) => a.length ? a.reduce((p, c) => p + c, 0) / a.length : null;
const r1 = (v: number | null) => v == null ? null : Math.round(v * 10) / 10;

function aggregateStation(s: StationAgg, lat: number, lon: number) {
  const monthly = Array.from({ length: 12 }, (_, m) => ({
    month: m + 1,
    rrTotal: r1(mean(s.rr[m])) ?? 0,
    tMean: r1(mean(s.tm[m])),
    tMin: r1(mean(s.tn[m])),
    tMax: r1(mean(s.tx[m])),
    gelDays: Math.round(mean(s.gel[m]) ?? 0),
    yearsUsed: s.rr[m].length,
  }));
  const yearsUsed = Math.max(...monthly.map(m => m.yearsUsed));
  const annual = {
    rrTotal: Math.round(monthly.reduce((a, b) => a + b.rrTotal, 0) * 10) / 10,
    tMean: r1(mean(monthly.map(m => m.tMean).filter((v): v is number => v != null))) ?? 0,
    gelDays: monthly.reduce((a, b) => a + b.gelDays, 0),
  };
  return {
    station: { id: s.id, nom: s.nom, lat: s.lat, lon: s.lon, alti: s.alti },
    period: { startYear: WINDOW_START, endYear: WINDOW_END, yearsRequested: WINDOW_YEARS, yearsUsed },
    monthly, annual,
    distanceKm: Math.round(haversineKm({ lat, lon }, s) * 10) / 10,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const lat = Number(body?.lat), lon = Number(body?.lon);
    if (!isFinite(lat) || !isFinite(lon)) throw new Error('lat/lon invalides');
    const proximityKm = Math.max(0, Math.min(50, Number(body?.proximityKm) || 8));

    const dLat = proximityKm / 111;
    const dLon = proximityKm / (111 * Math.max(0.1, Math.cos(lat * Math.PI / 180)));
    const minComputedAt = new Date(Date.now() - CACHE_TTL_DAYS * 86400000).toISOString();
    const { data: nearby } = await supabaseAdmin
      .from('meteo_station_climate_cache')
      .select('data, computed_at, station_lat, station_lon')
      .eq('years_requested', WINDOW_YEARS).eq('end_year', WINDOW_END)
      .gte('computed_at', minComputedAt)
      .gte('station_lat', lat - dLat).lte('station_lat', lat + dLat)
      .gte('station_lon', lon - dLon).lte('station_lon', lon + dLon);
    if (nearby?.length) {
      const best = nearby
        .filter(r => r.station_lat != null && r.station_lon != null)
        .map(r => ({ r, d: haversineKm({ lat, lon }, { lat: r.station_lat as number, lon: r.station_lon as number }) }))
        .filter(x => x.d <= proximityKm).sort((a, b) => a.d - b.d)[0];
      if (best) return new Response(JSON.stringify({ ...(best.r.data as Record<string, unknown>), distanceKm: Math.round(best.d * 10) / 10, cached: true, cacheReason: 'proximity' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const dept = await reverseGeocodeDept(lat, lon);
    const csv = await fetchDeptCsv(dept);
    const stations = parseAndIndex(csv);
    if (!stations.size) throw new Error(`aucune station ${WINDOW_START}-${WINDOW_END} dans dept ${dept}`);

    let best: StationAgg | null = null, bestDist = Infinity;
    for (const s of stations.values()) {
      const yearsRR = Math.max(...s.rr.map(a => a.length));
      if (yearsRR < 10) continue;
      const d = haversineKm({ lat, lon }, s);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    if (!best) throw new Error(`aucune station avec assez de données dans dept ${dept}`);

    const payload = aggregateStation(best, lat, lon);
    supabaseAdmin.from('meteo_station_climate_cache').upsert({
      station_id: best.id, years_requested: WINDOW_YEARS,
      start_year: WINDOW_START, end_year: WINDOW_END, data: payload,
      station_lat: best.lat, station_lon: best.lon,
      computed_at: new Date().toISOString(),
    }).then(({ error }) => { if (error) console.warn('cache write failed:', error.message); });

    return new Response(JSON.stringify({ ...payload, cached: false, cacheReason: 'computed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('meteo-climate error:', message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
