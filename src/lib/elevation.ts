/**
 * Fetch elevation data from IGN Géoplateforme API
 * Creates a grid of elevation points within the given bounds
 */

export interface ElevationPoint {
  lon: number;
  lat: number;
  z: number;
}

export interface ElevationGrid {
  data: number[][];
  width: number;
  height: number;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  minElev: number;
  maxElev: number;
}

const IGN_ALTI_URL = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json";

async function fetchElevationBatch(lons: number[], lats: number[]): Promise<ElevationPoint[]> {
  const lonStr = lons.map(l => l.toFixed(6)).join("|");
  const latStr = lats.map(l => l.toFixed(6)).join("|");
  
  const url = `${IGN_ALTI_URL}?lon=${lonStr}&lat=${latStr}&resource=ign_rge_alti_wld&zonly=false`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IGN API error: ${res.status}`);
  
  const json = await res.json();
  return json.elevations as ElevationPoint[];
}

export async function fetchElevationGrid(
  bounds: { south: number; north: number; west: number; east: number },
  resolution: number = 50,
  onProgress?: (pct: number) => void
): Promise<ElevationGrid> {
  const { south, north, west, east } = bounds;
  
  // Calculate grid dimensions
  const latStep = (north - south) / (resolution - 1);
  const lonStep = (east - west) / (resolution - 1);
  
  // Build all points
  const allLons: number[] = [];
  const allLats: number[] = [];
  
  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      allLons.push(west + col * lonStep);
      allLats.push(south + row * latStep);
    }
  }
  
  // IGN API limits to ~50 points per request
  const BATCH_SIZE = 50;
  const elevations: ElevationPoint[] = [];
  
  for (let i = 0; i < allLons.length; i += BATCH_SIZE) {
    const batchLons = allLons.slice(i, i + BATCH_SIZE);
    const batchLats = allLats.slice(i, i + BATCH_SIZE);
    
    const batch = await fetchElevationBatch(batchLons, batchLats);
    elevations.push(...batch);
    
    onProgress?.(Math.min(100, Math.round(((i + BATCH_SIZE) / allLons.length) * 100)));
  }
  
  // Build 2D grid
  const data: number[][] = [];
  let minElev = Infinity;
  let maxElev = -Infinity;
  
  for (let row = 0; row < resolution; row++) {
    const rowData: number[] = [];
    for (let col = 0; col < resolution; col++) {
      const idx = row * resolution + col;
      const z = elevations[idx]?.z ?? 0;
      rowData.push(z);
      if (z < minElev) minElev = z;
      if (z > maxElev) maxElev = z;
    }
    data.push(rowData);
  }
  
  return {
    data,
    width: resolution,
    height: resolution,
    minLon: west,
    maxLon: east,
    minLat: south,
    maxLat: north,
    minElev,
    maxElev,
  };
}
