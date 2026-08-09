/**
 * Simulation d'écoulement d'eau (100 % client, aucun appel réseau).
 *
 * Algorithme D8 « steepest descent » sur la grille RGE ALTI déjà en mémoire.
 * Convention de la grille (cf. elevation.ts) : data[row][col],
 *   row 0 = SUD (lat mini), col 0 = OUEST (lon mini).
 */

import type { ElevationGrid } from "./elevation";

export interface FlowLine {
  /** [lon, lat, elevation] */
  points: [number, number, number][];
  /** Dénivelé total parcouru (m). */
  drop: number;
  /** Longueur au sol (m). */
  length: number;
}

export interface FlowOptions {
  /** Un point de départ tous les seedStep pixels. */
  seedStep?: number;
  /** Dénivelé minimum pour conserver un filet (m). */
  minDrop?: number;
  /** Nombre maximum de pas D8. */
  maxSteps?: number;
}

export interface FlowRenderStyle {
  density: number;
  width: number;
  kind: "dots" | "dashes" | "solid";
}

export const DEFAULT_FLOW_RENDER: FlowRenderStyle = {
  density: 1,
  width: 1,
  kind: "dots",
};

/** Pas de semis par défaut pour une grille donnée. */
export function defaultSeedStep(grid: ElevationGrid): number {
  return Math.max(2, Math.round(Math.min(grid.width, grid.height) / 27));
}

const NEIGHBORS: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

export function computeFlowLines(
  grid: ElevationGrid,
  opts: FlowOptions = {}
): FlowLine[] {
  const { width: W, height: H, data } = grid;
  if (W < 3 || H < 3) return [];

  const seedStep = Math.max(1, Math.round(opts.seedStep ?? defaultSeedStep(grid)));
  const minDrop = opts.minDrop ?? 1;
  const maxSteps = opts.maxSteps ?? W * H;

  const midLat = ((grid.minLat + grid.maxLat) / 2) * Math.PI / 180;
  const dLat = (grid.maxLat - grid.minLat) / Math.max(H - 1, 1);
  const dLon = (grid.maxLon - grid.minLon) / Math.max(W - 1, 1);
  // Distances réelles en mètres d'un pas de grille
  const stepY = dLat * 111320;
  const stepX = dLon * 111320 * Math.cos(midLat);

  const lonAt = (c: number) => grid.minLon + c * dLon;
  const latAt = (r: number) => grid.minLat + r * dLat;

  const visited = new Uint8Array(W * H);
  const lines: FlowLine[] = [];

  for (let sr = 1; sr < H - 1; sr += seedStep) {
    for (let sc = 1; sc < W - 1; sc += seedStep) {
      let r = sr;
      let c = sc;
      if (visited[r * W + c]) continue;

      const pts: [number, number, number][] = [[lonAt(c), latAt(r), data[r][c]]];
      let length = 0;
      const startZ = data[r][c];

      for (let step = 0; step < maxSteps; step++) {
        const z = data[r][c];
        let bestSlope = 0;
        let bR = -1;
        let bC = -1;
        let bDist = 0;

        for (const [dr, dc] of NEIGHBORS) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
          const nz = data[nr][nc];
          if (!(nz < z)) continue;
          const dist = Math.hypot(dc * stepX, dr * stepY);
          if (dist <= 0) continue;
          const slope = (z - nz) / dist;
          if (slope > bestSlope) {
            bestSlope = slope;
            bR = nr;
            bC = nc;
            bDist = dist;
          }
        }

        // Cuvette : aucun voisin plus bas
        if (bR < 0) break;
        visited[r * W + c] = 1;
        r = bR;
        c = bC;
        length += bDist;
        pts.push([lonAt(c), latAt(r), data[r][c]]);
        // Bord de grille
        if (r === 0 || c === 0 || r === H - 1 || c === W - 1) break;
        // Confluence : on rejoint un talweg déjà tracé
        if (visited[r * W + c]) break;
      }

      const drop = startZ - pts[pts.length - 1][2];
      if (pts.length >= 3 && drop >= minDrop) {
        lines.push({ points: pts, drop, length });
      }
    }
  }

  return lines;
}

/** Lissage Chaikin (corner-cutting 0.25/0.75), extrémités fixes. */
export function smoothFlowPoints(
  points: [number, number, number][],
  iterations = 2
): [number, number, number][] {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) return pts;
    const out: [number, number, number][] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      out.push([
        a[0] * 0.75 + b[0] * 0.25,
        a[1] * 0.75 + b[1] * 0.25,
        a[2] * 0.75 + b[2] * 0.25,
      ]);
      out.push([
        a[0] * 0.25 + b[0] * 0.75,
        a[1] * 0.25 + b[1] * 0.75,
        a[2] * 0.25 + b[2] * 0.75,
      ]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/** dashArray Leaflet correspondant au style choisi. */
export function flowDashArray(kind: FlowRenderStyle["kind"], weight: number): string | undefined {
  if (kind === "solid") return undefined;
  if (kind === "dashes") return `${Math.max(6, weight * 5)},${Math.max(5, weight * 4)}`;
  return `1,${Math.max(5, weight * 4)}`;
}
