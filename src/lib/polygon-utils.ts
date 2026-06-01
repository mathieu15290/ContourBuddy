/**
 * Polygon utilities — bounding box, surface, centroïde, clipping de polylignes.
 * Toutes les coordonnées sont en [lon, lat] (ordre GeoJSON).
 */

export type LonLat = [number, number];

export interface PolygonSelection {
  /** Sommets du polygone (fermé implicitement, sans répétition du premier point). */
  coordinates: LonLat[];
  bounds: { south: number; north: number; west: number; east: number };
  /** Surface approximative en km² (projection équirectangulaire à la latitude médiane). */
  areaKm2: number;
  /** Centroïde géométrique (lon, lat). */
  centroid: LonLat;
}

export function polygonBounds(coords: LonLat[]) {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return { south, north, west, east };
}

/** Aire en km² via projection équirectangulaire à la latitude moyenne. */
export function polygonAreaKm2(coords: LonLat[]): number {
  if (coords.length < 3) return 0;
  const R = 6371; // km
  const b = polygonBounds(coords);
  const midLat = ((b.north + b.south) / 2) * Math.PI / 180;
  const kx = (Math.PI / 180) * R * Math.cos(midLat);
  const ky = (Math.PI / 180) * R;
  let sum = 0;
  for (let i = 0; i < coords.length; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[(i + 1) % coords.length];
    sum += (x1 * kx) * (y2 * ky) - (x2 * kx) * (y1 * ky);
  }
  return Math.abs(sum) / 2;
}

/** Centroïde simple basé sur la bounding box (suffisant pour recadrage). */
export function polygonCentroid(coords: LonLat[]): LonLat {
  const b = polygonBounds(coords);
  return [(b.west + b.east) / 2, (b.south + b.north) / 2];
}

export function buildPolygonSelection(coords: LonLat[]): PolygonSelection {
  return {
    coordinates: coords,
    bounds: polygonBounds(coords),
    areaKm2: polygonAreaKm2(coords),
    centroid: polygonCentroid(coords),
  };
}

/** Test point-in-polygon (ray casting). polygon en [lon, lat]. */
export function pointInPolygon(pt: LonLat, polygon: LonLat[]): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Intersection de deux segments. Retourne le point d'intersection ou null. */
function segIntersect(
  a1: LonLat, a2: LonLat, b1: LonLat, b2: LonLat
): LonLat | null {
  const [x1, y1] = a1, [x2, y2] = a2, [x3, y3] = b1, [x4, y4] = b2;
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-15) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

/**
 * Clip une polyline contre un polygone : retourne 0..N sous-polylines
 * contenant uniquement les parties à l'intérieur du polygone.
 */
export function clipPolylineToPolygon(
  line: LonLat[],
  polygon: LonLat[]
): LonLat[][] {
  if (line.length < 2 || polygon.length < 3) return [];
  const result: LonLat[][] = [];
  let current: LonLat[] = [];
  let prev = line[0];
  let prevIn = pointInPolygon(prev, polygon);
  if (prevIn) current.push(prev);

  for (let i = 1; i < line.length; i++) {
    const curr = line[i];
    const currIn = pointInPolygon(curr, polygon);

    // Collecter les intersections avec les arêtes du polygone
    const hits: { pt: LonLat; t: number }[] = [];
    const dx = curr[0] - prev[0], dy = curr[1] - prev[1];
    for (let j = 0, k = polygon.length - 1; j < polygon.length; k = j++) {
      const ip = segIntersect(prev, curr, polygon[k], polygon[j]);
      if (ip) {
        const t = Math.abs(dx) > Math.abs(dy)
          ? (ip[0] - prev[0]) / (dx || 1e-15)
          : (ip[1] - prev[1]) / (dy || 1e-15);
        hits.push({ pt: ip, t });
      }
    }
    hits.sort((a, b) => a.t - b.t);

    let insideNow = prevIn;
    for (const h of hits) {
      if (insideNow) {
        current.push(h.pt);
        if (current.length >= 2) result.push(current);
        current = [];
      } else {
        current.push(h.pt);
      }
      insideNow = !insideNow;
    }
    if (currIn) current.push(curr);

    prev = curr;
    prevIn = currIn;
  }
  if (current.length >= 2) result.push(current);
  return result;
}
