/**
 * Interrogation de la Carte des sols (INRAE / GIS Sol) au point cliqué.
 *
 * Service WFS Géoplateforme : https://data.geopf.fr/wfs/ows
 *   TYPENAMES=INRA.CARTE.SOLS:geoportail_vf
 *
 * ⚠️ Ce service n'accepte la BBOX qu'en EPSG:3857. Une BBOX en EPSG:4326
 * renvoie 0 feature, et les filtres CQL / INTERSECTS ne fonctionnent pas.
 * La sortie étant en WGS84, on filtre côté client par point-in-polygon.
 */

const WFS_URL = "https://data.geopf.fr/wfs/ows";
const TYPENAME = "INRA.CARTE.SOLS:geoportail_vf";
const PADDING_M = 400;

export interface SoilUcsInfo {
  noUcs?: string;
  idUcs?: string;
  nomUcs?: string;
  /** Nom du GER dominant (ex. "BRUNISOL"). */
  gerNom?: string;
  /** Pourcentage lu dans `ger_nom` (ex. "BRUNISOL(33%)") ou `pourcnt`. */
  pourcent?: number;
  etat?: string;
  structr?: string;
  gestnnr?: string;
  /** Fiche PDF GIS Sol. */
  lienGer?: string;
  url?: string;
  /** Couleur de pastille déduite du GER. */
  color: string;
}

// -----------------------------------------------------------------------------
// Couleurs officielles de la légende (33 GER)
// Ordre important : tester les composés « …-Rédoxisols » avant les simples.
// -----------------------------------------------------------------------------
const GER_COLORS: { re: RegExp; color: string }[] = [
  { re: /colluviosols?[-\s]*r[ée]doxisols?/i, color: "rgb(41,160,98)" },
  { re: /brunisols?[-\s]*r[ée]doxisols?/i, color: "rgb(166,102,75)" },
  { re: /n[ée]oluvisols?[-\s]*r[ée]doxisols?/i, color: "rgb(188,80,74)" },
  { re: /luvisols?[-\s]*r[ée]doxisols?/i, color: "rgb(229,190,111)" },

  { re: /lithosols?/i, color: "rgb(235,235,235)" },
  { re: /r[ée]gosols?/i, color: "rgb(239,224,223)" },
  { re: /rankosols?/i, color: "rgb(150,150,150)" },
  { re: /ar[ée]nosols?/i, color: "rgb(234,232,208)" },
  { re: /peyrosols?/i, color: "rgb(202,202,202)" },

  { re: /colluviosols?/i, color: "rgb(187,252,93)" },
  { re: /fluviosols?/i, color: "rgb(85,233,198)" },
  { re: /thalassosols?/i, color: "rgb(191,255,227)" },
  { re: /sodisalisols?/i, color: "rgb(230,255,196)" },

  { re: /rendisols?/i, color: "rgb(255,218,152)" },
  { re: /calcisols?/i, color: "rgb(255,188,64)" },
  { re: /rendosols?/i, color: "rgb(255,253,190)" },
  { re: /calcosols?/i, color: "rgb(255,252,92)" },
  { re: /dolomitosols?/i, color: "rgb(255,188,183)" },

  { re: /brunisols?/i, color: "rgb(194,141,65)" },
  { re: /andosols?/i, color: "rgb(122,33,21)" },
  { re: /vertisols?/i, color: "rgb(150,152,60)" },
  { re: /organosols?/i, color: "rgb(77,77,77)" },

  { re: /fersialsols?/i, color: "rgb(244,21,37)" },
  { re: /n[ée]oluvisols?/i, color: "rgb(216,96,40)" },
  { re: /v[ée]racrisols?/i, color: "rgb(167,36,119)" },
  { re: /alocrisols?/i, color: "rgb(245,155,251)" },
  { re: /podzosols?/i, color: "rgb(200,50,233)" },
  { re: /luvisols?/i, color: "rgb(240,211,181)" },

  { re: /histosols?/i, color: "rgb(19,70,156)" },
  { re: /r[ée]ductisols?/i, color: "rgb(19,154,251)" },
  { re: /r[ée]doxisols?/i, color: "rgb(82,202,253)" },
  { re: /planosols?/i, color: "rgb(188,153,183)" },
  { re: /p[ée]losols?/i, color: "rgb(164,188,217)" },
];

export function gerColor(name?: string): string {
  if (!name) return "rgb(180,180,180)";
  for (const { re, color } of GER_COLORS) if (re.test(name)) return color;
  return "rgb(180,180,180)";
}

// -----------------------------------------------------------------------------
// Géométrie
// -----------------------------------------------------------------------------
function toMercator(lon: number, lat: number): [number, number] {
  const R = 6378137;
  const x = (R * lon * Math.PI) / 180;
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [x, y];
}

type Ring = [number, number][];

function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-15) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Polygon = [outer, ...holes]. */
function pointInPolygonWithHoles(x: number, y: number, poly: Ring[]): boolean {
  if (!poly.length || !pointInRing(x, y, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (pointInRing(x, y, poly[i])) return false;
  return true;
}

function geometryContains(geom: unknown, lon: number, lat: number): boolean {
  const g = geom as { type?: string; coordinates?: unknown };
  if (!g || !g.type) return false;
  if (g.type === "Polygon") {
    return pointInPolygonWithHoles(lon, lat, g.coordinates as Ring[]);
  }
  if (g.type === "MultiPolygon") {
    return (g.coordinates as Ring[][]).some((p) => pointInPolygonWithHoles(lon, lat, p));
  }
  return false;
}

// -----------------------------------------------------------------------------
// Parsing
// -----------------------------------------------------------------------------
function normalizeUrl(u?: string): string | undefined {
  if (!u) return undefined;
  const s = String(u).trim();
  if (!s) return undefined;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("http://")) return `https://${s.slice(7)}`;
  return s;
}

function parseGer(raw?: string): { name?: string; pct?: number } {
  if (!raw) return {};
  const m = /^(.*?)\s*\((\d+(?:[.,]\d+)?)\s*%\)\s*$/.exec(raw.trim());
  if (m) return { name: m[1].trim(), pct: parseFloat(m[2].replace(",", ".")) };
  return { name: raw.trim() };
}

// -----------------------------------------------------------------------------
// Requête principale
// -----------------------------------------------------------------------------
export async function fetchSoilUcsAtPoint(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<SoilUcsInfo | null> {
  const [cx, cy] = toMercator(lon, lat);
  const bbox = [cx - PADDING_M, cy - PADDING_M, cx + PADDING_M, cy + PADDING_M];

  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: TYPENAME,
    OUTPUTFORMAT: "application/json",
    SRSNAME: "EPSG:4326",
    COUNT: "30",
    BBOX: `${bbox.join(",")},EPSG:3857`,
  });

  const res = await fetch(`${WFS_URL}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`WFS sols : HTTP ${res.status}`);
  const json = (await res.json()) as {
    features?: { properties?: Record<string, unknown>; geometry?: unknown }[];
  };
  const features = json.features ?? [];
  if (!features.length) return null;

  const hit = features.find((f) => geometryContains(f.geometry, lon, lat));
  if (!hit) return null;

  const p = (hit.properties ?? {}) as Record<string, unknown>;
  const str = (k: string) => (p[k] == null ? undefined : String(p[k]).trim() || undefined);
  const ger = parseGer(str("ger_nom"));
  const pctRaw = p["pourcnt"];
  const pourcent =
    ger.pct ?? (pctRaw == null ? undefined : Number(String(pctRaw).replace(",", ".")));

  return {
    noUcs: str("no_ucs"),
    idUcs: str("id_ucs"),
    nomUcs: str("nom_ucs"),
    gerNom: ger.name,
    pourcent: Number.isFinite(pourcent as number) ? (pourcent as number) : undefined,
    etat: str("etat"),
    structr: str("structr"),
    gestnnr: str("gestnnr"),
    lienGer: normalizeUrl(str("lien_ger")),
    url: normalizeUrl(str("url")),
    color: gerColor(ger.name),
  };
}
