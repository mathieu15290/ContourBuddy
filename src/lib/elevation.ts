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
const BATCH_SIZE = 180;
const MAX_RETRIES = 4;
const BASE_RETRY_DELAY_MS = 800;
const CACHE_MAX_ENTRIES = 500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// LRU-style cache keyed by rounded coordinates
const elevationCache = new Map<string, number>();

function cacheKey(lon: number, lat: number): string {
  return `${lon.toFixed(6)},${lat.toFixed(6)}`;
}

function getCachedElevations(lons: number[], lats: number[]): { cached: (number | null)[]; missIndices: number[] } {
  const cached: (number | null)[] = [];
  const missIndices: number[] = [];
  for (let i = 0; i < lons.length; i++) {
    const key = cacheKey(lons[i], lats[i]);
    if (elevationCache.has(key)) {
      cached.push(elevationCache.get(key)!);
    } else {
      cached.push(null);
      missIndices.push(i);
    }
  }
  return { cached, missIndices };
}

function storeInCache(lons: number[], lats: number[], elevations: number[]) {
  for (let i = 0; i < lons.length; i++) {
    const key = cacheKey(lons[i], lats[i]);
    elevationCache.set(key, elevations[i]);
  }
  // Evict oldest entries if cache is too large
  if (elevationCache.size > CACHE_MAX_ENTRIES) {
    const excess = elevationCache.size - CACHE_MAX_ENTRIES;
    const iter = elevationCache.keys();
    for (let i = 0; i < excess; i++) {
      elevationCache.delete(iter.next().value!);
    }
  }
}

async function fetchElevationBatchRaw(
  lons: number[],
  lats: number[],
  attempt: number = 0
): Promise<number[]> {
  const lonStr = lons.map((lon) => lon.toFixed(6)).join("|");
  const latStr = lats.map((lat) => lat.toFixed(6)).join("|");
  const url = `${IGN_ALTI_URL}?lon=${lonStr}&lat=${latStr}&resource=ign_rge_alti_wld&zonly=true`;

  const res = await fetch(url);

  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after") ?? 0);
      const delay = retryAfter > 0
        ? retryAfter * 1000
        : BASE_RETRY_DELAY_MS * Math.pow(2, attempt);

      await wait(delay);
      return fetchElevationBatchRaw(lons, lats, attempt + 1);
    }

    if (res.status === 429) {
      throw new Error("L'API IGN est momentanément saturée. Réessayez dans quelques secondes.");
    }

    throw new Error(`IGN API error: ${res.status}`);
  }

  const json = await res.json();
  return json.elevations as number[];
}

async function fetchElevationBatch(lons: number[], lats: number[]): Promise<number[]> {
  const { cached, missIndices } = getCachedElevations(lons, lats);

  if (missIndices.length === 0) {
    return cached as number[];
  }

  // Fetch only missing points
  const missLons = missIndices.map((i) => lons[i]);
  const missLats = missIndices.map((i) => lats[i]);

  // Batch the misses
  const fetched = new Array<number>(missLons.length);
  const totalBatches = Math.ceil(missLons.length / BATCH_SIZE);
  for (let b = 0; b < totalBatches; b++) {
    const s = b * BATCH_SIZE;
    const e = Math.min(s + BATCH_SIZE, missLons.length);
    const batch = await fetchElevationBatchRaw(missLons.slice(s, e), missLats.slice(s, e));
    for (let j = 0; j < batch.length; j++) fetched[s + j] = batch[j];
  }

  storeInCache(missLons, missLats, fetched);

  // Merge back
  const result = [...cached] as number[];
  for (let i = 0; i < missIndices.length; i++) {
    result[missIndices[i]] = fetched[i];
  }
  return result;
}

/**
 * Compute the distance in meters between two lat/lon points (Haversine).
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface ProfilePoint {
  distance: number;
  elevation: number;
  lat: number;
  lon: number;
}

/**
 * Fetch elevation data along a polyline defined by lat/lon waypoints.
 * Interpolates `numPoints` evenly-spaced samples along the line.
 */
export async function fetchElevationAlongLine(
  waypoints: [number, number][], // [lat, lon][]
  numPoints: number = 150,
  onProgress?: (pct: number) => void
): Promise<ProfilePoint[]> {
  // Compute cumulative distances along the waypoints
  const segDists: number[] = [0];
  for (let i = 1; i < waypoints.length; i++) {
    const d = haversineDistance(waypoints[i - 1][0], waypoints[i - 1][1], waypoints[i][0], waypoints[i][1]);
    segDists.push(segDists[i - 1] + d);
  }
  const totalDist = segDists[segDists.length - 1];
  if (totalDist === 0) return [];

  // Interpolate evenly spaced points
  const lons: number[] = [];
  const lats: number[] = [];
  const distances: number[] = [];

  for (let i = 0; i < numPoints; i++) {
    const d = (i / (numPoints - 1)) * totalDist;
    distances.push(d);
    // Find the segment
    let seg = 0;
    for (let s = 1; s < segDists.length; s++) {
      if (segDists[s] >= d) { seg = s - 1; break; }
    }
    const segLen = segDists[seg + 1] - segDists[seg];
    const t = segLen > 0 ? (d - segDists[seg]) / segLen : 0;
    const lat = waypoints[seg][0] + t * (waypoints[seg + 1][0] - waypoints[seg][0]);
    const lon = waypoints[seg][1] + t * (waypoints[seg + 1][1] - waypoints[seg][1]);
    lats.push(lat);
    lons.push(lon);
  }

  // Fetch elevations (with cache)
  const elevations = await fetchElevationBatch(lons, lats);
  onProgress?.(100);

  return distances.map((d, i) => ({ distance: d, elevation: elevations[i], lat: lats[i], lon: lons[i] }));
}

export async function fetchElevationGrid(
  bounds: { south: number; north: number; west: number; east: number },
  resolution: number = 50,
  onProgress?: (pct: number) => void
): Promise<ElevationGrid> {
  const { south, north, west, east } = bounds;

  const latStep = (north - south) / (resolution - 1);
  const lonStep = (east - west) / (resolution - 1);

  const allLons: number[] = [];
  const allLats: number[] = [];

  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      allLons.push(west + col * lonStep);
      allLats.push(south + row * latStep);
    }
  }

  // Fetch elevations (with cache)
  const elevations = await fetchElevationBatch(allLons, allLats);
  onProgress?.(100);

  const data: number[][] = [];
  let minElev = Infinity;
  let maxElev = -Infinity;

  for (let row = 0; row < resolution; row++) {
    const rowData: number[] = [];

    for (let col = 0; col < resolution; col++) {
      const idx = row * resolution + col;
      const z = elevations[idx] ?? 0;
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
