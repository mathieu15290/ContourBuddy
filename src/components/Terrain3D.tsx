import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Sky, Html } from "@react-three/drei";
import * as THREE from "three";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ElevationGrid } from "@/lib/elevation";
import type { ContourResult } from "@/lib/contours";
import { smoothFlowPoints, type FlowLine } from "@/lib/flow";
import { Loader2 } from "lucide-react";

export type Basemap3D = "satellite" | "plan" | "none";

export interface Marker3D {
  lat: number;
  lon: number;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  grid: ElevationGrid | null;
  contours: ContourResult | null;
  flowLines: FlowLine[];
  exaggeration: number;
  basemap: Basemap3D;
  markers?: Marker3D[];
}

const MAX_SEGMENTS = 250;

// -----------------------------------------------------------------------------
// Projection locale (mètres réels) centrée sur la zone
// -----------------------------------------------------------------------------
function makeProjector(grid: ElevationGrid) {
  const centerLat = (grid.minLat + grid.maxLat) / 2;
  const centerLon = (grid.minLon + grid.maxLon) / 2;
  const mPerLat = 111320;
  const mPerLon = 111320 * Math.cos((centerLat * Math.PI) / 180);
  return {
    centerLat,
    centerLon,
    widthM: (grid.maxLon - grid.minLon) * mPerLon,
    heightM: (grid.maxLat - grid.minLat) * mPerLat,
    project: (lon: number, lat: number, elev: number, exag: number): [number, number, number] => [
      (lon - centerLon) * mPerLon,
      elev * exag,
      -(lat - centerLat) * mPerLat,
    ],
  };
}

// -----------------------------------------------------------------------------
// Mosaïque de tuiles WMTS IGN → CanvasTexture
// -----------------------------------------------------------------------------
const TILE_LAYERS: Record<Exclude<Basemap3D, "none">, { layer: string; format: string; ext: string }> = {
  satellite: { layer: "ORTHOIMAGERY.ORTHOPHOTOS", format: "image/jpeg", ext: "jpeg" },
  plan: { layer: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", format: "image/png", ext: "png" },
};

const lon2x = (lon: number, z: number) => ((lon + 180) / 360) * Math.pow(2, z);
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z);
};

async function buildBasemapTexture(
  grid: ElevationGrid,
  basemap: Exclude<Basemap3D, "none">,
  signal: AbortSignal
): Promise<THREE.CanvasTexture | null> {
  const cfg = TILE_LAYERS[basemap];
  const TILE = 256;
  const MAX_TILES = 400;

  // Choix du zoom : viser ~1400–2500 px de large, puis rétrograder si trop de tuiles.
  let zoom = 19;
  for (let z = 8; z <= 19; z++) {
    const px = (lon2x(grid.maxLon, z) - lon2x(grid.minLon, z)) * TILE;
    if (px >= 1400) {
      zoom = px > 2500 ? Math.max(8, z - 1) : z;
      break;
    }
    zoom = z;
  }

  let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
  while (zoom > 5) {
    x0 = Math.floor(lon2x(grid.minLon, zoom));
    x1 = Math.floor(lon2x(grid.maxLon, zoom));
    y0 = Math.floor(lat2y(grid.maxLat, zoom));
    y1 = Math.floor(lat2y(grid.minLat, zoom));
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (count <= MAX_TILES) break;
    zoom -= 1;
  }

  const cols = x1 - x0 + 1;
  const rows = y1 - y0 + 1;
  const mosaic = document.createElement("canvas");
  mosaic.width = cols * TILE;
  mosaic.height = rows * TILE;
  const mctx = mosaic.getContext("2d");
  if (!mctx) return null;
  mctx.fillStyle = "#9db38a";
  mctx.fillRect(0, 0, mosaic.width, mosaic.height);

  const loadTile = (x: number, y: number) =>
    new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (!signal.aborted) mctx.drawImage(img, (x - x0) * TILE, (y - y0) * TILE, TILE, TILE);
        resolve();
      };
      img.onerror = () => resolve();
      img.src =
        `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
        `&LAYER=${encodeURIComponent(cfg.layer)}&STYLE=normal&FORMAT=${encodeURIComponent(cfg.format)}` +
        `&TILEMATRIXSET=PM&TILEMATRIX=${zoom}&TILEROW=${y}&TILECOL=${x}`;
    });

  const jobs: Promise<void>[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) jobs.push(loadTile(x, y));
  await Promise.all(jobs);
  if (signal.aborted) return null;

  // Recadrage exact sur la bbox
  const px0 = (lon2x(grid.minLon, zoom) - x0) * TILE;
  const px1 = (lon2x(grid.maxLon, zoom) - x0) * TILE;
  const py0 = (lat2y(grid.maxLat, zoom) - y0) * TILE;
  const py1 = (lat2y(grid.minLat, zoom) - y0) * TILE;
  const out = document.createElement("canvas");
  out.width = Math.max(2, Math.round(px1 - px0));
  out.height = Math.max(2, Math.round(py1 - py0));
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.drawImage(mosaic, px0, py0, px1 - px0, py1 - py0, 0, 0, out.width, out.height);

  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// -----------------------------------------------------------------------------
// Maillage du terrain
// -----------------------------------------------------------------------------
function hypsometricColor(t: number): [number, number, number] {
  // vert → jaune-brun → brun → gris
  const stops: [number, [number, number, number]][] = [
    [0, [0.29, 0.49, 0.27]],
    [0.4, [0.75, 0.7, 0.35]],
    [0.75, [0.55, 0.4, 0.27]],
    [1, [0.72, 0.72, 0.72]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i];
    const [p1, c1] = stops[i + 1];
    if (t <= p1) {
      const k = (t - p0) / Math.max(p1 - p0, 1e-6);
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
    }
  }
  return stops[stops.length - 1][1];
}

function TerrainMesh({
  grid,
  exaggeration,
  texture,
}: {
  grid: ElevationGrid;
  exaggeration: number;
  texture: THREE.Texture | null;
}) {
  const proj = useMemo(() => makeProjector(grid), [grid]);

  const geometry = useMemo(() => {
    const stepC = Math.max(1, Math.ceil(grid.width / MAX_SEGMENTS));
    const stepR = Math.max(1, Math.ceil(grid.height / MAX_SEGMENTS));
    const cols = Math.floor((grid.width - 1) / stepC) + 1;
    const rows = Math.floor((grid.height - 1) / stepR) + 1;

    const geo = new THREE.PlaneGeometry(proj.widthM, proj.heightM, cols - 1, rows - 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const range = Math.max(grid.maxElev - grid.minElev, 1);

    // Le PlaneGeometry est parcouru du haut (nord) vers le bas ;
    // la grille RGE ALTI a sa ligne 0 au SUD → on inverse l'index de ligne.
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const idx = j * cols + i;
        const gr = Math.min(grid.height - 1, (rows - 1 - j) * stepR);
        const gc = Math.min(grid.width - 1, i * stepC);
        const z = grid.data[gr][gc];
        pos.setZ(idx, z * exaggeration);
        const [r, g, b] = hypsometricColor((z - grid.minElev) / range);
        colors[idx * 3] = r;
        colors[idx * 3 + 1] = g;
        colors[idx * 3 + 2] = b;
      }
    }
    pos.needsUpdate = true;
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [grid, exaggeration, proj]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      {texture ? (
        <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
      ) : (
        <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
      )}
    </mesh>
  );
}

// -----------------------------------------------------------------------------
// Overlays
// -----------------------------------------------------------------------------
function ContourOverlay({
  grid,
  contours,
  exaggeration,
}: {
  grid: ElevationGrid;
  contours: ContourResult;
  exaggeration: number;
}) {
  const proj = useMemo(() => makeProjector(grid), [grid]);
  const objects = useMemo(() => {
    const out: { geo: THREE.BufferGeometry; major: boolean }[] = [];
    for (const line of contours.lines) {
      if (line.coordinates.length < 2) continue;
      const pts = line.coordinates.map(([lon, lat]) => {
        const [x, y, z] = proj.project(lon, lat, line.elevation, exaggeration);
        return new THREE.Vector3(x, y + 1.2, z);
      });
      out.push({ geo: new THREE.BufferGeometry().setFromPoints(pts), major: line.isMajor });
    }
    return out;
  }, [contours, proj, exaggeration]);

  useEffect(() => () => objects.forEach((o) => o.geo.dispose()), [objects]);

  return (
    <group>
      {objects.map((o, i) => (
        <primitive
          key={i}
          object={new THREE.Line(
            o.geo,
            new THREE.LineBasicMaterial({
              color: o.major ? "#7a4b1e" : "#a9743c",
              transparent: true,
              opacity: o.major ? 0.95 : 0.6,
            })
          )}
        />
      ))}
    </group>
  );
}

function FlowOverlay({
  grid,
  flowLines,
  exaggeration,
}: {
  grid: ElevationGrid;
  flowLines: FlowLine[];
  exaggeration: number;
}) {
  const proj = useMemo(() => makeProjector(grid), [grid]);
  const paths = useMemo(
    () =>
      flowLines.map((fl) =>
        smoothFlowPoints(fl.points, 2).map(([lon, lat, e]) => {
          const [x, y, z] = proj.project(lon, lat, e, exaggeration);
          return new THREE.Vector3(x, y + 2, z);
        })
      ),
    [flowLines, proj, exaggeration]
  );

  const lines = useMemo(
    () =>
      paths.map(
        (p) =>
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(p),
            new THREE.LineBasicMaterial({ color: "#2b7fd4", transparent: true, opacity: 0.9 })
          )
      ),
    [paths]
  );

  useEffect(
    () => () => lines.forEach((l) => { l.geometry.dispose(); (l.material as THREE.Material).dispose(); }),
    [lines]
  );

  // Pastilles animées descendant le long de chaque chemin
  const dotsRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = Math.min(paths.length, 400);

  useFrame(({ clock }) => {
    const mesh = dotsRef.current;
    if (!mesh || !count) return;
    const t = clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      const p = paths[i];
      if (!p || p.length < 2) continue;
      const f = ((t * 0.18 + i * 0.137) % 1) * (p.length - 1);
      const i0 = Math.floor(f);
      const v = p[i0].clone().lerp(p[Math.min(i0 + 1, p.length - 1)], f - i0);
      dummy.position.copy(v);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {lines.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
      {count > 0 && (
        <instancedMesh ref={dotsRef} args={[undefined as never, undefined as never, count]}>
          <sphereGeometry args={[Math.max(2, proj.widthM / 400), 8, 8]} />
          <meshBasicMaterial color="#8fd0ff" />
        </instancedMesh>
      )}
    </group>
  );
}

function MarkersOverlay({
  grid,
  markers,
  exaggeration,
}: {
  grid: ElevationGrid;
  markers: Marker3D[];
  exaggeration: number;
}) {
  const proj = useMemo(() => makeProjector(grid), [grid]);
  const sample = (lon: number, lat: number) => {
    const c = Math.round(((lon - grid.minLon) / Math.max(grid.maxLon - grid.minLon, 1e-9)) * (grid.width - 1));
    const r = Math.round(((lat - grid.minLat) / Math.max(grid.maxLat - grid.minLat, 1e-9)) * (grid.height - 1));
    const rr = Math.min(grid.height - 1, Math.max(0, r));
    const cc = Math.min(grid.width - 1, Math.max(0, c));
    return grid.data[rr][cc];
  };
  return (
    <group>
      {markers.map((m, i) => {
        const [x, y, z] = proj.project(m.lon, m.lat, sample(m.lon, m.lat), exaggeration);
        const h = Math.max(20, proj.heightM / 20);
        return (
          <group key={i} position={[x, y, z]}>
            <mesh position={[0, h / 2, 0]}>
              <cylinderGeometry args={[Math.max(1, h / 30), Math.max(1, h / 30), h, 6]} />
              <meshBasicMaterial color="#c0392b" />
            </mesh>
            <Html position={[0, h + h / 6, 0]} center distanceFactor={proj.widthM / 2}>
              <div className="px-1.5 py-0.5 rounded bg-card/90 border border-border text-[11px] text-foreground whitespace-nowrap shadow">
                {m.label}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function CameraRig({ radius }: { radius: number }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(radius * 0.8, radius * 0.7, radius * 0.9);
    camera.lookAt(0, 0, 0);
  }, [camera, radius]);
  return null;
}

// -----------------------------------------------------------------------------
export function Terrain3D({
  open,
  onOpenChange,
  grid,
  contours,
  flowLines,
  exaggeration,
  basemap,
  markers = [],
}: Props) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const [loadingTex, setLoadingTex] = useState(false);
  const [showFlow, setShowFlow] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showContours, setShowContours] = useState(true);

  useEffect(() => {
    // Toute texture précédente est périmée dès que le fond ou la zone change.
    setTexture(null);
    if (!open || !grid || basemap === "none") return;
    const ctrl = new AbortController();
    setLoadingTex(true);
    buildBasemapTexture(grid, basemap, ctrl.signal)
      .then((tex) => {
        if (!ctrl.signal.aborted) setTexture(tex);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingTex(false);
      });
    return () => {
      ctrl.abort();
      setLoadingTex(false);
    };
  }, [open, grid, basemap]);

  useEffect(() => () => texture?.dispose(), [texture]);

  const radius = useMemo(() => {
    if (!grid) return 1000;
    const p = makeProjector(grid);
    return Math.max(p.widthM, p.heightM) * 0.9 + 200;
  }, [grid]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-[95vw] h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-4 py-2.5 border-b border-border shrink-0">
          <DialogTitle className="text-base">
            Vue 3D du terrain
            {grid && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {Math.round(grid.minElev)} m → {Math.round(grid.maxElev)} m
                {" · "}amplitude {Math.round(grid.maxElev - grid.minElev)} m
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="relative flex-1 min-h-0 bg-muted">
          {!grid ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Générez d'abord les courbes de niveaux pour disposer d'un modèle de terrain.
            </div>
          ) : (
            <>
              <Canvas
                camera={{ fov: 50, near: 1, far: radius * 12 }}
                dpr={[1, 1.5]}
                gl={{ antialias: true, powerPreference: "high-performance" }}
              >
                <CameraRig radius={radius} />
                <Sky sunPosition={[100, 40, 100]} />
                <ambientLight intensity={0.7} />
                <directionalLight position={[radius, radius, radius * 0.6]} intensity={1.1} />
                <TerrainMesh grid={grid} exaggeration={exaggeration} texture={texture} />
                {showContours && contours && (
                  <ContourOverlay grid={grid} contours={contours} exaggeration={exaggeration} />
                )}
                {showFlow && flowLines.length > 0 && (
                  <FlowOverlay grid={grid} flowLines={flowLines} exaggeration={exaggeration} />
                )}
                {showMarkers && markers.length > 0 && (
                  <MarkersOverlay grid={grid} markers={markers} exaggeration={exaggeration} />
                )}
                <OrbitControls
                  enableDamping
                  maxPolarAngle={Math.PI / 2.05}
                  minDistance={radius * 0.05}
                  maxDistance={radius * 4}
                />
              </Canvas>

              <div className="absolute top-3 left-3 flex flex-col gap-1.5 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-2.5 shadow-lg text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showFlow} onChange={(e) => setShowFlow(e.target.checked)} />
                  💧 Écoulement d'eau
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showContours} onChange={(e) => setShowContours(e.target.checked)} />
                  ⛰️ Courbes de niveaux
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showMarkers} onChange={(e) => setShowMarkers(e.target.checked)} />
                  📌 Marqueurs
                </label>
              </div>

              {loadingTex && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-card/90 border border-border rounded-md px-3 py-1.5 text-xs text-muted-foreground shadow">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Chargement du fond {basemap === "satellite" ? "aérien" : "IGN"}…
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default Terrain3D;
