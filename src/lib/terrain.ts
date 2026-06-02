/**
 * Terrain analysis — pente (%) et exposition (azimut 0–360°)
 * via l'algorithme de Horn 3×3, et rendu raster sur canvas.
 *
 * Convention de la grille d'élévation : data[row][col],
 *   row 0 = SUD, row augmente vers le NORD
 *   col 0 = OUEST, col augmente vers l'EST
 */

import type { ElevationGrid } from "./elevation";
import { pointInPolygon, type LonLat } from "./polygon-utils";

export interface TerrainGrid {
  width: number;
  height: number;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  /** Pente en pourcent (NaN aux bords). */
  slope: Float32Array;
  /** Exposition en degrés (0=N, 90=E, 180=S, 270=O). NaN si plat. */
  aspect: Float32Array;
  maxSlope: number;
}

export type TerrainMode = "slope" | "aspect";

export function computeTerrain(grid: ElevationGrid): TerrainGrid {
  const { width: W, height: H, data } = grid;
  const slope = new Float32Array(W * H);
  const aspect = new Float32Array(W * H);
  slope.fill(NaN);
  aspect.fill(NaN);

  const midLat = ((grid.minLat + grid.maxLat) / 2) * Math.PI / 180;
  const dy = ((grid.maxLat - grid.minLat) / Math.max(H - 1, 1)) * 111320;
  const dx =
    ((grid.maxLon - grid.minLon) / Math.max(W - 1, 1)) * 111320 * Math.cos(midLat);

  let maxSlope = 0;

  for (let r = 1; r < H - 1; r++) {
    for (let c = 1; c < W - 1; c++) {
      // 3x3 neighborhood. row 0 = SUD, donc N = r+1, S = r-1.
      const zNW = data[r + 1][c - 1];
      const zN = data[r + 1][c];
      const zNE = data[r + 1][c + 1];
      const zW = data[r][c - 1];
      const zE = data[r][c + 1];
      const zSW = data[r - 1][c - 1];
      const zS = data[r - 1][c];
      const zSE = data[r - 1][c + 1];

      const dzdx = (zNE + 2 * zE + zSE - (zNW + 2 * zW + zSW)) / (8 * dx);
      const dzdy = (zNW + 2 * zN + zNE - (zSW + 2 * zS + zSE)) / (8 * dy);

      const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
      const slopePct = Math.tan(slopeRad) * 100;
      const idx = r * W + c;
      slope[idx] = slopePct;
      if (slopePct > maxSlope) maxSlope = slopePct;

      if (dzdx === 0 && dzdy === 0) {
        aspect[idx] = NaN;
      } else {
        let a = (Math.atan2(dzdx, dzdy) * 180) / Math.PI + 180;
        a = ((a % 360) + 360) % 360;
        aspect[idx] = a;
      }
    }
  }

  return {
    width: W,
    height: H,
    minLon: grid.minLon,
    maxLon: grid.maxLon,
    minLat: grid.minLat,
    maxLat: grid.maxLat,
    slope,
    aspect,
    maxSlope,
  };
}

/** 6 classes permaculture. Renvoie [r,g,b,a] sur 0–255. */
export function slopeColor(pct: number): [number, number, number, number] {
  if (!isFinite(pct)) return [0, 0, 0, 0];
  if (pct < 2) return [56, 142, 201, 200];
  if (pct < 8) return [126, 196, 84, 200];
  if (pct < 15) return [212, 207, 73, 200];
  if (pct < 25) return [232, 154, 58, 200];
  if (pct < 45) return [196, 82, 46, 210];
  return [120, 40, 30, 220];
}

const ASPECT_STOPS: { deg: number; rgb: [number, number, number] }[] = [
  { deg: 0, rgb: [70, 110, 200] },    // N
  { deg: 45, rgb: [110, 180, 200] },  // NE
  { deg: 90, rgb: [240, 220, 90] },   // E
  { deg: 135, rgb: [240, 170, 60] },  // SE
  { deg: 180, rgb: [220, 70, 60] },   // S
  { deg: 225, rgb: [200, 80, 140] },  // SW
  { deg: 270, rgb: [150, 80, 200] },  // W
  { deg: 315, rgb: [90, 110, 220] },  // NW
  { deg: 360, rgb: [70, 110, 200] },  // N (wrap)
];

/** Interpolation linéaire entre les 8 secteurs cardinaux. */
export function aspectColor(deg: number): [number, number, number, number] {
  if (!isFinite(deg)) return [0, 0, 0, 0];
  const d = ((deg % 360) + 360) % 360;
  for (let i = 0; i < ASPECT_STOPS.length - 1; i++) {
    const a = ASPECT_STOPS[i];
    const b = ASPECT_STOPS[i + 1];
    if (d >= a.deg && d <= b.deg) {
      const t = (d - a.deg) / (b.deg - a.deg);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t),
        200,
      ];
    }
  }
  return [0, 0, 0, 0];
}

/**
 * Rend un canvas couleur (upscaled) pour le mode demandé.
 * Si clipPolygon est fourni (≥ 3 sommets), tout pixel hors polygone est transparent.
 */
export function renderTerrainCanvas(
  terrain: TerrainGrid,
  mode: TerrainMode,
  scale = 4,
  clipPolygon?: LonLat[] | null
): HTMLCanvasElement {
  const W = terrain.width * scale;
  const H = terrain.height * scale;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);

  const lonStep = (terrain.maxLon - terrain.minLon) / Math.max(W - 1, 1);
  const latStep = (terrain.maxLat - terrain.minLat) / Math.max(H - 1, 1);
  const clipping = !!(clipPolygon && clipPolygon.length >= 3);

  for (let y = 0; y < H; y++) {
    // Flip Y : canvas top = nord, terrain row 0 = sud.
    const gy = terrain.height - 1 - Math.floor(y / scale);
    const lat = terrain.maxLat - y * latStep;
    for (let x = 0; x < W; x++) {
      const gx = Math.floor(x / scale);
      const idx = gy * terrain.width + gx;
      const offset = (y * W + x) * 4;

      if (clipping) {
        const lon = terrain.minLon + x * lonStep;
        if (!pointInPolygon([lon, lat], clipPolygon!)) {
          img.data[offset] = 0;
          img.data[offset + 1] = 0;
          img.data[offset + 2] = 0;
          img.data[offset + 3] = 0;
          continue;
        }
      }

      const value = mode === "slope" ? terrain.slope[idx] : terrain.aspect[idx];
      const [r, g, b, a] = mode === "slope" ? slopeColor(value) : aspectColor(value);
      img.data[offset] = r;
      img.data[offset + 1] = g;
      img.data[offset + 2] = b;
      img.data[offset + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export const SLOPE_LEGEND = [
  { label: "< 2 % — zones humides", color: "rgb(56,142,201)" },
  { label: "2–8 % — cultures", color: "rgb(126,196,84)" },
  { label: "8–15 % — agroforesterie", color: "rgb(212,207,73)" },
  { label: "15–25 % — vergers / terrasses", color: "rgb(232,154,58)" },
  { label: "25–45 % — forêt", color: "rgb(196,82,46)" },
  { label: "> 45 % — non exploitable", color: "rgb(120,40,30)" },
];

export const ASPECT_LEGEND = [
  { label: "N", color: "rgb(70,110,200)" },
  { label: "E", color: "rgb(240,220,90)" },
  { label: "S", color: "rgb(220,70,60)" },
  { label: "O", color: "rgb(150,80,200)" },
];
