const TILE_CACHE = "esri-tiles-v1";
const STORAGE_KEY = "iraq_map_cached_v2";

const TILE_LAYERS = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile",
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile",
];

interface BBox {
  south: number;
  north: number;
  west: number;
  east: number;
  minZoom: number;
  maxZoom: number;
}

const REGIONS: BBox[] = [
  { south: 29.0, north: 37.4, west: 38.7, east: 48.8, minZoom: 5, maxZoom: 10 },
  { south: 33.1, north: 33.55, west: 44.15, east: 44.65, minZoom: 11, maxZoom: 14 },
];

function lonLatToTile(lat: number, lon: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return [x, y];
}

function buildTileUrls(): string[] {
  const urls: string[] = [];
  for (const region of REGIONS) {
    for (let z = region.minZoom; z <= region.maxZoom; z++) {
      const [x1, y1] = lonLatToTile(region.north, region.west, z);
      const [x2, y2] = lonLatToTile(region.south, region.east, z);
      const xMin = Math.min(x1, x2);
      const xMax = Math.max(x1, x2);
      const yMin = Math.min(y1, y2);
      const yMax = Math.max(y1, y2);
      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          for (const layer of TILE_LAYERS) {
            urls.push(`${layer}/${z}/${y}/${x}`);
          }
        }
      }
    }
  }
  return urls;
}

async function downloadWithConcurrency(
  urls: string[],
  concurrency: number,
  onProgress?: (done: number, total: number) => void,
) {
  const cache = await caches.open(TILE_CACHE);
  let index = 0;
  let done = 0;

  async function worker() {
    while (index < urls.length) {
      const current = index++;
      const url = urls[current];
      try {
        const existing = await cache.match(url);
        if (!existing) {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
          }
        }
      } catch {
        // Ignore individual tile failures (offline mid-download, rate limiting, etc.)
      }
      done++;
      onProgress?.(done, urls.length);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
}

export function isIraqMapCached(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export async function ensureIraqMapCached(
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (isIraqMapCached()) {
    return;
  }
  if (!("caches" in window)) {
    return;
  }
  if (!navigator.onLine) {
    return;
  }

  const urls = buildTileUrls();
  await downloadWithConcurrency(urls, 4, onProgress);
  localStorage.setItem(STORAGE_KEY, "true");
}

export function registerMapServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Service worker registration failure should not break the app.
    });
  }
}
