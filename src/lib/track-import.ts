/**
 * Parse GPX or KML files into a list of [lat, lon] waypoints.
 * Supports tracks (trk/trkseg/trkpt), routes (rte/rtept), and KML LineString coordinates.
 */

export type TrackPoint = [number, number]; // [lat, lon]

export interface ParsedTrack {
  name: string;
  points: TrackPoint[];
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new Error("Fichier XML invalide");
  return doc;
}

function parseGpx(doc: Document): ParsedTrack {
  const name =
    doc.querySelector("trk > name")?.textContent?.trim() ||
    doc.querySelector("rte > name")?.textContent?.trim() ||
    doc.querySelector("metadata > name")?.textContent?.trim() ||
    "Trace GPX";

  const points: TrackPoint[] = [];

  // Track points
  doc.querySelectorAll("trkpt").forEach((pt) => {
    const lat = parseFloat(pt.getAttribute("lat") || "");
    const lon = parseFloat(pt.getAttribute("lon") || "");
    if (Number.isFinite(lat) && Number.isFinite(lon)) points.push([lat, lon]);
  });

  // Route points (fallback if no trkpt)
  if (points.length === 0) {
    doc.querySelectorAll("rtept").forEach((pt) => {
      const lat = parseFloat(pt.getAttribute("lat") || "");
      const lon = parseFloat(pt.getAttribute("lon") || "");
      if (Number.isFinite(lat) && Number.isFinite(lon)) points.push([lat, lon]);
    });
  }

  return { name, points };
}

function parseKml(doc: Document): ParsedTrack {
  const name =
    doc.querySelector("Placemark > name")?.textContent?.trim() ||
    doc.querySelector("Document > name")?.textContent?.trim() ||
    "Trace KML";

  const points: TrackPoint[] = [];

  // LineString / LinearRing coordinates: "lon,lat[,alt] lon,lat[,alt] ..."
  const coordNodes = doc.querySelectorAll(
    "LineString > coordinates, LinearRing > coordinates, gx\\:Track > gx\\:coord, Track > coord"
  );
  coordNodes.forEach((node) => {
    const raw = (node.textContent || "").trim();
    if (!raw) return;
    // gx:coord format is "lon lat alt" space-separated per element
    if (node.nodeName.toLowerCase().endsWith("coord") && !node.nodeName.toLowerCase().includes("coordinates")) {
      const parts = raw.split(/\s+/).map(parseFloat);
      if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        points.push([parts[1], parts[0]]);
      }
      return;
    }
    raw.split(/\s+/).forEach((tuple) => {
      const [lon, lat] = tuple.split(",").map(parseFloat);
      if (Number.isFinite(lat) && Number.isFinite(lon)) points.push([lat, lon]);
    });
  });

  return { name, points };
}

export async function parseTrackFile(file: File): Promise<ParsedTrack> {
  const text = await file.text();
  const lower = file.name.toLowerCase();
  const doc = parseXml(text);

  let track: ParsedTrack;
  if (lower.endsWith(".gpx") || doc.documentElement.nodeName.toLowerCase() === "gpx") {
    track = parseGpx(doc);
  } else if (lower.endsWith(".kml") || doc.documentElement.nodeName.toLowerCase() === "kml") {
    track = parseKml(doc);
  } else {
    throw new Error("Format non supporté (GPX ou KML attendu)");
  }

  if (track.points.length < 2) {
    throw new Error("Aucun point de tracé trouvé dans le fichier");
  }

  // Downsample very long tracks to keep API + rendering responsive.
  const MAX_POINTS = 300;
  if (track.points.length > MAX_POINTS) {
    const step = track.points.length / MAX_POINTS;
    const sampled: TrackPoint[] = [];
    for (let i = 0; i < MAX_POINTS; i++) {
      sampled.push(track.points[Math.floor(i * step)]);
    }
    // Always keep the last point
    sampled.push(track.points[track.points.length - 1]);
    track.points = sampled;
  }

  return track;
}

export function trackBounds(points: TrackPoint[]) {
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const [lat, lon] of points) {
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lon < west) west = lon;
    if (lon > east) east = lon;
  }
  return { south, north, west, east };
}
