/**
 * Interrogation de la carte lithologique simplifiée du BRGM au point cliqué.
 *
 * Service WMS : https://geoservices.brgm.fr/geologie
 *   LAYERS=LITHO_1M_SIMPLIFIEE  (carte au 1/1 000 000, interrogeable)
 *
 * ⚠️ Le service ne renvoie rien si la BBOX du GetFeatureInfo est trop petite :
 * on essaie successivement un demi-côté de 0.02° puis 0.08°.
 */

const WMS_URL = "https://geoservices.brgm.fr/geologie";
const LAYER = "LITHO_1M_SIMPLIFIEE";

export interface GeologyInfo {
  /** Description lithologique (champ DESCR). */
  descr?: string;
  /** Type / famille de roche (champ TYPE). */
  type?: string;
  /** Couleur officielle convertie depuis les composantes CMJN du service. */
  color: string;
}

function cmykToRgb(c: number, m: number, y: number, k: number): string {
  const f = (v: number) => Math.round(255 * (1 - v) * (1 - k));
  return `rgb(${f(c)},${f(m)},${f(y)})`;
}

function num(raw?: string): number {
  if (!raw) return 0;
  const v = parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(v)) return 0;
  return v > 1 ? v / 100 : v;
}

function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<(?:[\\w.-]+:)?${name}[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, "i").exec(xml);
  if (!m) return undefined;
  const v = m[1].replace(/<[^>]*>/g, "").trim();
  return v || undefined;
}

/** Lecture agronomique de la roche-mère, par famille lithologique. */
export function geologyAgronomy(text?: string): { family: string; pros: string; cons: string } {
  const t = (text ?? "").toLowerCase();
  const has = (...k: string[]) => k.some((s) => t.includes(s));

  if (has("argile"))
    return {
      family: "Roche sédimentaire — argiles",
      pros: "Forte réserve en eau et en éléments nutritifs, bonne fertilité potentielle.",
      cons: "Sols lourds, hydromorphes en hiver, se fissurent en été ; travail du sol difficile.",
    };
  if (has("calcaire", "marne", "gypse", "craie"))
    return {
      family: "Roche sédimentaire — calcaires / marnes",
      pros: "pH basique, bonne structure, sols drainants et faciles à travailler.",
      cons: "Sols souvent superficiels et séchants ; risque de chlorose ferrique.",
    };
  if (has("grès"))
    return {
      family: "Roche sédimentaire — grès",
      pros: "Sols filtrants, se réchauffant vite au printemps.",
      cons: "Faible réserve utile, acidification et pauvreté minérale fréquentes.",
    };
  if (has("sable"))
    return {
      family: "Roche sédimentaire — sables",
      pros: "Sols légers, drainants, précoces, faciles à travailler.",
      cons: "Très faible rétention d'eau et lessivage rapide des nutriments.",
    };
  if (has("basalte", "rhyolite"))
    return {
      family: "Roche magmatique — volcanique",
      pros: "Basaltes riches en bases (Ca, Mg, K), sols souvent très fertiles.",
      cons: "Rhyolites acides et pauvres ; sols parfois pierreux et superficiels.",
    };
  if (has("granite", "granitique"))
    return {
      family: "Roche magmatique — granites",
      pros: "Sols sableux, drainants, riches en potassium.",
      cons: "Acidité marquée, faible teneur en calcium, réserve en eau limitée.",
    };
  if (has("ophiolite", "péridotite", "serpentin"))
    return {
      family: "Roche métamorphique / ultrabasique — ophiolites",
      pros: "Riches en magnésium et oligo-éléments.",
      cons: "Déséquilibre Ca/Mg et métaux lourds (Ni, Cr) : fertilité souvent contraignante.",
    };
  if (has("gneiss", "micaschiste", "schiste"))
    return {
      family: "Roche métamorphique — schistes / gneiss",
      pros: "Altération en sols bien structurés, schistes chauffants favorables à la vigne.",
      cons: "Sols acides, souvent caillouteux et de faible profondeur.",
    };
  return {
    family: "Formation géologique",
    pros: "Comportement agronomique variable selon l'altération locale.",
    cons: "Vérifier la profondeur de sol et l'acidité sur le terrain.",
  };
}

export async function fetchGeologyAtPoint(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<GeologyInfo | null> {
  for (const d of [0.02, 0.08]) {
    // WMS 1.3.0 + EPSG:4326 → ordre des axes lat,lon
    const bbox = [lat - d, lon - d, lat + d, lon + d].join(",");
    const params = new URLSearchParams({
      SERVICE: "WMS",
      VERSION: "1.3.0",
      REQUEST: "GetFeatureInfo",
      LAYERS: LAYER,
      QUERY_LAYERS: LAYER,
      STYLES: "",
      CRS: "EPSG:4326",
      BBOX: bbox,
      WIDTH: "101",
      HEIGHT: "101",
      I: "50",
      J: "50",
      INFO_FORMAT: "application/vnd.ogc.gml",
      FEATURE_COUNT: "1",
    });

    const res = await fetch(`${WMS_URL}?${params.toString()}`, { signal });
    if (!res.ok) continue;
    const xml = await res.text();
    const descr = tag(xml, "DESCR");
    const type = tag(xml, "TYPE");
    if (!descr && !type) continue;

    const color = cmykToRgb(
      num(tag(xml, "C_FOND")),
      num(tag(xml, "M_FOND")),
      num(tag(xml, "J_FOND")),
      num(tag(xml, "N_FOND"))
    );
    return { descr, type, color };
  }
  return null;
}
