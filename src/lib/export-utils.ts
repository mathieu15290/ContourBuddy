/**
 * Export utilities for contour data
 */

import { saveAs } from "file-saver";
import type { ContourResult } from "./contours";
import { clipPolylineToPolygon, type PolygonSelection } from "./polygon-utils";

/**
 * Export as GeoJSON
 */
export function exportGeoJSON(contours: ContourResult, filename: string = "courbes-niveaux") {
  const blob = new Blob([JSON.stringify(contours.geojson, null, 2)], {
    type: "application/geo+json",
  });
  saveAs(blob, `${filename}.geojson`);
}

/**
 * Export as KML
 */
export function exportKML(contours: ContourResult, filename: string = "courbes-niveaux") {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Courbes de niveaux</name>
  <description>Generated contour lines</description>`;

  for (const line of contours.lines) {
    const coords = line.coordinates
      .map(([lon, lat]) => `${lon},${lat},0`)
      .join(" ");

    kml += `
  <Placemark>
    <name>Altitude ${line.elevation}m</name>
    <description>${line.isMajor ? "Courbe maîtresse" : "Courbe normale"} - ${line.elevation}m</description>
    <Style>
      <LineStyle>
        <color>ff0000ff</color>
        <width>${line.isMajor ? 3 : 1}</width>
      </LineStyle>
    </Style>
    <LineString>
      <altitudeMode>absolute</altitudeMode>
      <coordinates>${coords}</coordinates>
    </LineString>
  </Placemark>`;
  }

  kml += `
</Document>
</kml>`;

  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  saveAs(blob, `${filename}.kml`);
}

/**
 * Récupère les entités cadastrales IGN (Parcellaire Express) dans la bbox du polygone.
 * Endpoint WFS Géoplateforme, sans clé. Retourne un tableau de features GeoJSON.
 */
async function fetchCadastreWFS(
  typename: string,
  polygon: PolygonSelection
): Promise<any[]> {
  const { south, west, north, east } = polygon.bounds;
  const url = new URL("https://data.geopf.fr/wfs/ows");
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typenames", typename);
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("srsName", "EPSG:4326");
  // WFS 2.0 + EPSG:4326 → ordre lat,lon,lat,lon
  url.searchParams.set("bbox", `${south},${west},${north},${east},EPSG:4326`);
  url.searchParams.set("count", "5000");
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.features) ? json.features : [];
  } catch {
    return [];
  }
}

/** Itère chaque anneau polygonal (Polygon ou MultiPolygon) en [lon,lat]. */
function* iterPolygonRings(geom: any): Generator<[number, number][]> {
  if (!geom) return;
  if (geom.type === "Polygon") {
    for (const ring of geom.coordinates) yield ring as [number, number][];
  } else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates)
      for (const ring of poly) yield ring as [number, number][];
  }
}

/** Centroïde simple (moyenne des sommets) du premier anneau extérieur. */
function ringCentroid(ring: [number, number][]): [number, number] {
  let sx = 0, sy = 0, n = 0;
  for (const [x, y] of ring) { sx += x; sy += y; n++; }
  return n ? [sx / n, sy / n] : [0, 0];
}

/**
 * Export as DXF (courbes de niveaux + cadastre optionnel).
 * Si un `polygon` est fourni, ajoute parcelles (contours + n°), bâtiments et
 * sections cadastrales sur des calques dédiés, via le WFS IGN Parcellaire Express.
 */
export async function exportDXF(
  contours: ContourResult,
  filename: string = "courbes-niveaux",
  polygon?: PolygonSelection | null
) {
  // --- 1. Récup cadastre si polygone présent ---------------------------------
  type CadEntity = {
    layer: string;
    rings: [number, number][][];
    label?: { pt: [number, number]; text: string };
  };
  const cadastre: CadEntity[] = [];

  if (polygon && polygon.coordinates.length >= 3) {
    const [parcels, batiments, sections] = await Promise.all([
      fetchCadastreWFS("CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle", polygon),
      fetchCadastreWFS("CADASTRALPARCELS.PARCELLAIRE_EXPRESS:batiment", polygon),
      fetchCadastreWFS("CADASTRALPARCELS.PARCELLAIRE_EXPRESS:section", polygon),
    ]);

    for (const f of parcels) {
      const rings: [number, number][][] = [];
      let outer: [number, number][] | null = null;
      for (const ring of iterPolygonRings(f.geometry)) {
        rings.push(ring);
        if (!outer) outer = ring;
      }
      if (!rings.length) continue;
      const p = f.properties ?? {};
      const num = String(p.numero ?? p.NUMERO ?? p.idu ?? p.IDU ?? "").trim();
      cadastre.push({
        layer: "CADASTRE_PARCELLES",
        rings,
        label: outer && num ? { pt: ringCentroid(outer), text: num } : undefined,
      });
    }
    for (const f of batiments) {
      const rings: [number, number][][] = [];
      for (const ring of iterPolygonRings(f.geometry)) rings.push(ring);
      if (rings.length) cadastre.push({ layer: "CADASTRE_BATI", rings });
    }
    for (const f of sections) {
      const rings: [number, number][][] = [];
      for (const ring of iterPolygonRings(f.geometry)) rings.push(ring);
      if (rings.length) cadastre.push({ layer: "CADASTRE_SECTIONS", rings });
    }
  }

  // --- 2. Bbox globale + projection locale équirectangulaire en mètres -------
  let sumLat = 0, n = 0;
  let minLon = Infinity, minLat = Infinity;
  const acc = (lon: number, lat: number) => {
    sumLat += lat; n++;
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
  };
  for (const line of contours.lines) for (const [lo, la] of line.coordinates) acc(lo, la);
  for (const e of cadastre) {
    for (const ring of e.rings) for (const [lo, la] of ring) acc(lo, la);
    if (e.label) acc(e.label.pt[0], e.label.pt[1]);
  }
  if (!n) {
    const empty = new Blob(["0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n"], { type: "application/dxf" });
    saveAs(empty, `${filename}.dxf`);
    return;
  }
  const lat0 = sumLat / n;
  const R = 6378137;
  const mPerDegLat = (Math.PI * R) / 180;
  const mPerDegLon = mPerDegLat * Math.cos((lat0 * Math.PI) / 180);
  const project = (lon: number, lat: number): [number, number] => [
    (lon - minLon) * mPerDegLon,
    (lat - minLat) * mPerDegLat,
  ];

  // --- 3. Sérialisation DXF --------------------------------------------------
  let dxf = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n9\n$MEASUREMENT\n70\n1\n0\nENDSEC\n`;
  dxf += `0\nSECTION\n2\nTABLES\n0\nENDSEC\n`;
  dxf += `0\nSECTION\n2\nENTITIES\n`;

  // Courbes de niveaux — POLYLINE 3D avec Z = altitude
  for (const line of contours.lines) {
    if (line.coordinates.length < 2) continue;
    const layer = `${line.isMajor ? "MAJOR" : "MINOR"}_${line.elevation}`;
    dxf += `0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n8\n`;
    dxf += `10\n0\n20\n0\n30\n${line.elevation}\n`;
    for (const [lon, lat] of line.coordinates) {
      const [x, y] = project(lon, lat);
      dxf += `0\nVERTEX\n8\n${layer}\n70\n32\n`;
      dxf += `10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n30\n${line.elevation}\n`;
    }
    dxf += `0\nSEQEND\n8\n${layer}\n`;
  }

  // Cadastre — LWPOLYLINE 2D fermées + TEXT pour les n° de parcelle
  for (const e of cadastre) {
    for (const ring of e.rings) {
      if (ring.length < 2) continue;
      const pts = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1)
        : ring;
      if (pts.length < 2) continue;
      dxf += `0\nLWPOLYLINE\n8\n${e.layer}\n90\n${pts.length}\n70\n1\n`;
      for (const [lon, lat] of pts) {
        const [x, y] = project(lon, lat);
        dxf += `10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n`;
      }
    }
    if (e.label) {
      const [x, y] = project(e.label.pt[0], e.label.pt[1]);
      dxf += `0\nTEXT\n8\nCADASTRE_PARCELLES_TXT\n`;
      dxf += `10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n30\n0\n`;
      dxf += `40\n2.5\n1\n${e.label.text}\n`;
      dxf += `72\n1\n73\n2\n11\n${x.toFixed(3)}\n21\n${y.toFixed(3)}\n31\n0\n`;
    }
  }

  dxf += `0\nENDSEC\n0\nEOF\n`;

  const blob = new Blob([dxf], { type: "application/dxf" });
  saveAs(blob, `${filename}.dxf`);
}

/**
 * Export map as PNG using html-to-image
 */
export async function exportPNG(
  mapContainerEl: HTMLElement,
  filename: string = "courbes-niveaux"
) {
  const { toPng } = await import("html-to-image");
  const dataUrl = await toPng(mapContainerEl, { quality: 0.95 });
  saveAs(dataUrl, `${filename}.png`);
}

/**
 * Export contours as scalable SVG (Web Mercator projection, fitted to viewBox).
 * Major curves are drawn thicker; an elevation label is added on the longest
 * polyline of each elevation when it has enough points.
 */
export function exportSVG(
  contours: ContourResult,
  filename: string = "courbes-niveaux",
  polygon?: PolygonSelection | null
) {
  if (!contours.lines.length) return;

  // Optionally clip every contour line to the user polygon (intersection)
  const sourceLines = polygon && polygon.coordinates.length >= 3
    ? contours.lines.flatMap((line) => {
        const segs = clipPolylineToPolygon(line.coordinates, polygon.coordinates);
        return segs.map((coordinates) => ({ ...line, coordinates }));
      })
    : contours.lines;

  if (!sourceLines.length) return;

  // Web Mercator projection (lat clamped). Returns unscaled x/y in radians-ish.
  const project = (lon: number, lat: number): [number, number] => {
    const x = (lon * Math.PI) / 180;
    const clamped = Math.max(Math.min(lat, 85), -85);
    const y = -Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
    return [x, y];
  };

  // Bounding box in projected space — based on polygon if present, else on lines
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const accBbox = ([x, y]: [number, number]) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  const projected: { line: typeof sourceLines[number]; pts: [number, number][] }[] = [];
  for (const line of sourceLines) {
    const pts = line.coordinates.map(([lon, lat]) => project(lon, lat));
    projected.push({ line, pts });
  }

  let projectedPolygon: [number, number][] | null = null;
  if (polygon && polygon.coordinates.length >= 3) {
    projectedPolygon = polygon.coordinates.map(([lon, lat]) => project(lon, lat));
    projectedPolygon.forEach(accBbox);
  } else {
    for (const { pts } of projected) pts.forEach(accBbox);
  }

  const W = 2000;
  const bboxW = maxX - minX || 1;
  const bboxH = maxY - minY || 1;
  const H = Math.round((W * bboxH) / bboxW);
  const scale = W / bboxW;
  const toSvg = ([x, y]: [number, number]): [number, number] => [
    (x - minX) * scale,
    (y - minY) * scale,
  ];

  // Group lines by elevation to pick a labeling candidate (longest polyline)
  const longestByElev = new Map<number, { length: number; pts: [number, number][]; isMajor: boolean }>();

  let paths = "";
  for (const { line, pts } of projected) {
    if (pts.length < 2) continue;
    const svgPts = pts.map(toSvg);
    const d =
      "M" +
      svgPts
        .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
        .join(" L");
    const stroke = line.isMajor ? "#5a3a1a" : "#8b6f4a";
    const sw = line.isMajor ? 1.6 : 0.8;
    paths += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>\n`;

    // Track longest line for labeling
    let len = 0;
    for (let i = 1; i < svgPts.length; i++) {
      const dx = svgPts[i][0] - svgPts[i - 1][0];
      const dy = svgPts[i][1] - svgPts[i - 1][1];
      len += Math.hypot(dx, dy);
    }
    const cur = longestByElev.get(line.elevation);
    if (!cur || len > cur.length) {
      longestByElev.set(line.elevation, { length: len, pts: svgPts, isMajor: line.isMajor });
    }
  }

  // Labels: only on major curves with enough length
  let labels = "";
  for (const [elev, info] of longestByElev) {
    if (!info.isMajor) continue;
    if (info.length < 120) continue;
    const mid = info.pts[Math.floor(info.pts.length / 2)];
    const [x, y] = mid;
    labels += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#3a2410" text-anchor="middle" paint-order="stroke" stroke="#fff8ee" stroke-width="2.5">${elev}</text>\n`;
  }

  // Polygon outline overlay (drawn above contours)
  let polygonLayer = "";
  if (projectedPolygon) {
    const svgPoly = projectedPolygon.map(toSvg);
    const ptsAttr = svgPoly.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    polygonLayer = `<polygon points="${ptsAttr}" fill="none" stroke="hsl(152,45%,38%)" stroke-width="2" stroke-dasharray="6 4" stroke-linejoin="round"/>`;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="100%" height="100%" fill="#fff8ee"/>
<g>
${paths}</g>
<g>
${labels}</g>
${polygonLayer}
</svg>`;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  saveAs(blob, `${filename}.svg`);
}
