/**
 * Marching Squares algorithm for contour line generation
 * Produces GeoJSON LineStrings from an elevation grid
 */

import type { ElevationGrid } from "./elevation";

export interface ContourLine {
  elevation: number;
  isMajor: boolean;
  coordinates: [number, number][];
}

export interface ContourResult {
  lines: ContourLine[];
  geojson: GeoJSON.FeatureCollection;
}

/**
 * Linear interpolation between two values
 */
function lerp(v1: number, v2: number, threshold: number): number {
  if (Math.abs(v2 - v1) < 1e-10) return 0.5;
  return (threshold - v1) / (v2 - v1);
}

/**
 * Generate contour lines using Marching Squares
 */
function marchingSquares(
  grid: number[][],
  threshold: number,
  width: number,
  height: number
): [number, number][][] {
  const lines: [number, number][][] = [];
  
  for (let row = 0; row < height - 1; row++) {
    for (let col = 0; col < width - 1; col++) {
      const tl = grid[row][col];
      const tr = grid[row][col + 1];
      const br = grid[row + 1][col + 1];
      const bl = grid[row + 1][col];
      
      // Calculate case index (4-bit)
      let caseIndex = 0;
      if (tl >= threshold) caseIndex |= 8;
      if (tr >= threshold) caseIndex |= 4;
      if (br >= threshold) caseIndex |= 2;
      if (bl >= threshold) caseIndex |= 1;
      
      if (caseIndex === 0 || caseIndex === 15) continue;
      
      // Interpolated edge midpoints
      const top: [number, number] = [col + lerp(tl, tr, threshold), row];
      const right: [number, number] = [col + 1, row + lerp(tr, br, threshold)];
      const bottom: [number, number] = [col + lerp(bl, br, threshold), row + 1];
      const left: [number, number] = [col, row + lerp(tl, bl, threshold)];
      
      const segments: [number, number][][] = [];
      
      switch (caseIndex) {
        case 1: segments.push([left, bottom]); break;
        case 2: segments.push([bottom, right]); break;
        case 3: segments.push([left, right]); break;
        case 4: segments.push([top, right]); break;
        case 5: // Saddle
          segments.push([left, top]);
          segments.push([bottom, right]);
          break;
        case 6: segments.push([top, bottom]); break;
        case 7: segments.push([left, top]); break;
        case 8: segments.push([left, top]); break;
        case 9: segments.push([top, bottom]); break;
        case 10: // Saddle
          segments.push([top, right]);
          segments.push([left, bottom]);
          break;
        case 11: segments.push([top, right]); break;
        case 12: segments.push([left, right]); break;
        case 13: segments.push([bottom, right]); break;
        case 14: segments.push([left, bottom]); break;
      }
      
      lines.push(...segments);
    }
  }
  
  return lines;
}

/**
 * Connect individual segments into polylines
 */
function connectSegments(segments: [number, number][][]): [number, number][][] {
  if (segments.length === 0) return [];
  
  const used = new Set<number>();
  const polylines: [number, number][][] = [];
  
  const key = (p: [number, number]) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  
  // Build adjacency by endpoints
  const startMap = new Map<string, number[]>();
  const endMap = new Map<string, number[]>();
  
  segments.forEach((seg, i) => {
    const sk = key(seg[0]);
    const ek = key(seg[1]);
    if (!startMap.has(sk)) startMap.set(sk, []);
    startMap.get(sk)!.push(i);
    if (!endMap.has(ek)) endMap.set(ek, []);
    endMap.get(ek)!.push(i);
  });
  
  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    
    const line = [...segments[i]];
    
    // Extend forward
    let extended = true;
    while (extended) {
      extended = false;
      const lastKey = key(line[line.length - 1]);
      const candidates = startMap.get(lastKey) || [];
      for (const ci of candidates) {
        if (!used.has(ci)) {
          used.add(ci);
          line.push(segments[ci][1]);
          extended = true;
          break;
        }
      }
      if (!extended) {
        const endCandidates = endMap.get(lastKey) || [];
        for (const ci of endCandidates) {
          if (!used.has(ci)) {
            used.add(ci);
            line.push(segments[ci][0]);
            extended = true;
            break;
          }
        }
      }
    }
    
    polylines.push(line);
  }
  
  return polylines;
}

/**
 * Convert grid coordinates to geographic coordinates
 */
function gridToGeo(
  gridCoords: [number, number][],
  grid: ElevationGrid
): [number, number][] {
  const lonStep = (grid.maxLon - grid.minLon) / (grid.width - 1);
  const latStep = (grid.maxLat - grid.minLat) / (grid.height - 1);
  
  return gridCoords.map(([col, row]) => [
    grid.minLon + col * lonStep,
    grid.minLat + row * latStep,
  ]);
}

/**
 * Generate contour lines from elevation grid
 */
export function generateContours(
  grid: ElevationGrid,
  interval: number,
  majorInterval: number = 5
): ContourResult {
  const startElev = Math.ceil(grid.minElev / interval) * interval;
  const endElev = Math.floor(grid.maxElev / interval) * interval;
  
  const lines: ContourLine[] = [];
  const features: GeoJSON.Feature[] = [];
  
  for (let elev = startElev; elev <= endElev; elev += interval) {
    const segments = marchingSquares(grid.data, elev, grid.width, grid.height);
    const polylines = connectSegments(segments);
    
    const isMajor = (elev / interval) % majorInterval === 0;
    
    for (const polyline of polylines) {
      if (polyline.length < 2) continue;
      
      const geoCoords = gridToGeo(polyline, grid);
      
      lines.push({
        elevation: elev,
        isMajor,
        coordinates: geoCoords,
      });
      
      features.push({
        type: "Feature",
        properties: {
          elevation: elev,
          isMajor,
        },
        geometry: {
          type: "LineString",
          coordinates: geoCoords,
        },
      });
    }
  }
  
  return {
    lines,
    geojson: {
      type: "FeatureCollection",
      features,
    },
  };
}

/**
 * Get color for a given elevation value
 */
export function getContourColor(elevation: number, minElev: number, maxElev: number): string {
  const range = maxElev - minElev;
  if (range === 0) return "hsl(152, 45%, 28%)";
  
  const t = (elevation - minElev) / range;
  
  // Green (low) → Brown (mid) → Dark brown (high)
  if (t < 0.3) {
    const h = 120 + t * 40;
    return `hsl(${h}, 40%, ${55 - t * 30}%)`;
  } else if (t < 0.7) {
    const h = 30 + (0.7 - t) * 20;
    return `hsl(${h}, 50%, ${50 - t * 15}%)`;
  } else {
    const h = 20;
    return `hsl(${h}, 55%, ${40 - (t - 0.7) * 30}%)`;
  }
}
