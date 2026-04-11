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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchElevationBatch(
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
      return fetchElevationBatch(lons, lats, attempt + 1);
    }

    if (res.status === 429) {
      throw new Error("L'API IGN est momentanément saturée. Réessayez dans quelques secondes.");
    }

    throw new Error(`IGN API error: ${res.status}`);
  }

  const json = await res.json();
  return json.elevations as number[];
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

  const elevations = new Array<number>(allLons.length).fill(0);
  const totalBatches = Math.ceil(allLons.length / BATCH_SIZE);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, allLons.length);
    const batchLons = allLons.slice(start, end);
    const batchLats = allLats.slice(start, end);
    const batchElevations = await fetchElevationBatch(batchLons, batchLats);

    for (let offset = 0; offset < batchElevations.length; offset++) {
      elevations[start + offset] = Number(batchElevations[offset] ?? 0);
    }

    onProgress?.(Math.min(100, Math.round(((batchIndex + 1) / totalBatches) * 100)));
  }

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
