import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";
import type { ContourResult } from "@/lib/contours";
import { getContourColor } from "@/lib/contours";
import type { LayerState, LayerId, ExternalLayerConfig } from "@/lib/layers";
import { EXTERNAL_LAYER_CONFIGS } from "@/lib/layers";
import {
  buildPolygonSelection,
  clipPolylineToPolygon,
  type LonLat,
  type PolygonSelection,
} from "@/lib/polygon-utils";
import { renderTerrainCanvas, type TerrainGrid } from "@/lib/terrain";

interface HighlightPoint {
  lat: number;
  lon: number;
  elevation: number;
  distance: number;
}

interface Props {
  center: [number, number];
  zoom: number;
  contours: ContourResult | null;
  minElev: number;
  maxElev: number;
  onBoundsSelected: (bounds: { south: number; north: number; west: number; east: number }) => void;
  selectedBounds: { south: number; north: number; west: number; east: number } | null;
  mapRef: React.MutableRefObject<HTMLDivElement | null>;
  onProfileLineDrawn?: (waypoints: [number, number][]) => void;
  highlightPoint?: HighlightPoint | null;
  importedTrack?: { points: [number, number][]; name?: string } | null;
  layers: LayerState[];
  onPolygonChanged?: (polygon: PolygonSelection | null) => void;
  terrain?: TerrainGrid | null;
}

const POLY_COLOR = "hsl(152, 45%, 28%)";

const vertexIcon = L.divIcon({
  className: "poly-vertex",
  html: `<div style="
    width:14px;height:14px;border-radius:50%;
    background:${POLY_COLOR};border:2px solid #fff;
    box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const midpointIcon = L.divIcon({
  className: "poly-midpoint",
  html: `<div style="
    width:14px;height:14px;border-radius:50%;
    background:#fff;border:2px dashed ${POLY_COLOR};
    display:flex;align-items:center;justify-content:center;
    font:bold 11px/1 system-ui,sans-serif;color:${POLY_COLOR};
    box-shadow:0 1px 3px rgba(0,0,0,0.25);">+</div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// -----------------------------------------------------------------------------
// Factory Leaflet pour les couches externes (WMTS / WMS / group).
// -----------------------------------------------------------------------------
function buildExternalLayer(cfg: ExternalLayerConfig): L.Layer {
  if (cfg.kind === "wmts") {
    const url =
      `${cfg.url}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
      `&LAYER=${encodeURIComponent(cfg.layer)}` +
      `&STYLE=${encodeURIComponent(cfg.style ?? "normal")}` +
      `&FORMAT=${encodeURIComponent(cfg.format ?? "image/png")}` +
      `&TILEMATRIXSET=${cfg.matrixSet ?? "PM"}` +
      `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
    // Extrait le zoom min du nom du TileMatrixSet (ex. "PM_6_16" → minZoom=6)
    // pour empêcher Leaflet de demander des tuiles hors plage (→ 404).
    const tmsMatch = /^PM_(\d+)_(\d+)$/.exec(cfg.matrixSet ?? "");
    const minZoom = tmsMatch ? parseInt(tmsMatch[1], 10) : 0;
    const maxNativeZoom = tmsMatch ? parseInt(tmsMatch[2], 10) : cfg.maxZoom ?? 19;
    return L.tileLayer(url, {
      minZoom,
      maxNativeZoom,
      maxZoom: cfg.maxZoom ?? 19,
      attribution: cfg.attribution,
    });
  }
  if (cfg.kind === "wms") {
    return L.tileLayer.wms(cfg.url, {
      layers: cfg.layers,
      format: cfg.format ?? "image/png",
      version: cfg.version ?? "1.3.0",
      transparent: cfg.transparent ?? true,
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom ?? 19,
    });
  }
  const grp = L.layerGroup();
  cfg.children.forEach((c) => buildExternalLayer(c).addTo(grp));
  return grp;
}

function setLayerOpacity(layer: L.Layer, opacity: number) {
  const anyLayer = layer as L.Layer & { setOpacity?: (o: number) => void };
  if (typeof anyLayer.setOpacity === "function") {
    anyLayer.setOpacity(opacity);
  } else if (layer instanceof L.LayerGroup) {
    layer.eachLayer((child) => setLayerOpacity(child, opacity));
  }
}

export function ContourMap({
  center,
  zoom,
  contours,
  minElev,
  maxElev,
  onBoundsSelected,
  selectedBounds,
  mapRef,
  onProfileLineDrawn,
  highlightPoint,
  importedTrack,
  layers = [],
  onPolygonChanged,
  terrain = null,
}: Props) {
  const leafletMapRef = useRef<L.Map | null>(null);
  const contourLayerRef = useRef<L.LayerGroup | null>(null);
  const externalLayersRef = useRef<Partial<Record<LayerId, L.Layer>>>({});
  const slopeOverlayRef = useRef<L.ImageOverlay | null>(null);
  const aspectOverlayRef = useRef<L.ImageOverlay | null>(null);
  const rectRef = useRef<L.Rectangle | null>(null);
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false);
  const startLatLngRef = useRef<L.LatLng | null>(null);
  const tempRectRef = useRef<L.Rectangle | null>(null);
  const [selectionOffscreen, setSelectionOffscreen] = useState(false);
  const [selectionInfo, setSelectionInfo] = useState<{ widthM: number; heightM: number } | null>(null);

  // Profile drawing state
  const [drawingProfile, setDrawingProfile] = useState(false);
  const drawingProfileRef = useRef(false);
  const profilePointsRef = useRef<L.LatLng[]>([]);
  const profilePolylineRef = useRef<L.Polyline | null>(null);
  const profileMarkersRef = useRef<L.CircleMarker[]>([]);

  // Polygon state
  const [drawingPolygon, setDrawingPolygon] = useState(false);
  const drawingPolygonRef = useRef(false);
  const polygonLatLngsRef = useRef<L.LatLng[]>([]);
  const polygonLayerRef = useRef<L.Polygon | null>(null);
  const polygonVertexMarkersRef = useRef<L.Marker[]>([]);
  const polygonMidpointMarkersRef = useRef<L.Marker[]>([]);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [polygonInfo, setPolygonInfo] = useState<PolygonSelection | null>(null);
  // Refs to read latest helpers inside Leaflet handlers
  const onPolygonChangedRef = useRef(onPolygonChanged);
  useEffect(() => { onPolygonChangedRef.current = onPolygonChanged; }, [onPolygonChanged]);
  // Reset bridge — assigned during map init, called from the JSX button
  const resetPolygonRef = useRef<(() => void) | null>(null);
  const finishPolygonRef = useRef<(() => void) | null>(null);
  const [polygonInProgressCount, setPolygonInProgressCount] = useState(0);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    const map = L.map(mapRef.current, {
      center,
      zoom,
      zoomControl: true,
      maxZoom: 22,
    });

    // Instancie toutes les couches externes déclarées; la synchro visibilité/opacité
    // est gérée par un useEffect séparé (voir plus bas).
    const built: Partial<Record<LayerId, L.Layer>> = {};
    (Object.keys(EXTERNAL_LAYER_CONFIGS) as LayerId[]).forEach((id) => {
      const cfg = EXTERNAL_LAYER_CONFIGS[id];
      if (cfg) built[id] = buildExternalLayer(cfg);
    });
    externalLayersRef.current = built;

    // Custom draw buttons
    const DrawControl = L.Control.extend({
      options: { position: "topleft" as L.ControlPosition },
      onAdd() {
        const container = L.DomUtil.create("div", "leaflet-bar");
        container.innerHTML = `
          <a href="#" title="Dessiner un rectangle" style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;font-size:20px;cursor:pointer;background:white;" id="draw-rect-btn">▭</a>
          <a href="#" title="Dessiner un polygone" style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;font-size:18px;cursor:pointer;background:white;" id="draw-poly-btn">⬠</a>
          <a href="#" title="Dessiner un profil altimétrique" style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;font-size:18px;cursor:pointer;background:white;" id="draw-profile-btn">📈</a>
        `;
        L.DomEvent.disableClickPropagation(container);
        return container;
      },
    });
    new DrawControl().addTo(map);

    contourLayerRef.current = L.layerGroup().addTo(map);
    leafletMapRef.current = map;

    // Cartographic scale (bottom-left) — linear bar + ratio (1:X)
    L.control.scale({ position: "bottomleft", metric: true, imperial: false, maxWidth: 150 }).addTo(map);

    const RatioControl = L.Control.extend({
      options: { position: "bottomleft" as L.ControlPosition },
      onAdd() {
        const div = L.DomUtil.create("div", "leaflet-bar");
        div.style.cssText =
          "background:white;padding:2px 6px;font:11px/1.4 system-ui,sans-serif;color:#222;";
        div.innerHTML = "1:—";
        const update = () => {
          const c = map.getCenter();
          const metersPerPx =
            (40075016.686 * Math.cos((c.lat * Math.PI) / 180)) /
            Math.pow(2, map.getZoom() + 8);
          const screenMetersPerPx = 0.0002645833;
          const ratio = metersPerPx / screenMetersPerPx;
          const nice = (n: number) => {
            const pow = Math.pow(10, Math.floor(Math.log10(n)));
            const base = n / pow;
            const r = base < 1.5 ? 1 : base < 3 ? 2 : base < 7 ? 5 : 10;
            return r * pow;
          };
          const rounded = Math.round(nice(ratio));
          div.innerHTML = `1:${rounded.toLocaleString("fr-FR")}`;
        };
        update();
        map.on("zoomend moveend", update);
        return div;
      },
    });
    new RatioControl().addTo(map);

    // ========================================================================
    // POLYGON DRAWING & EDITING
    // ========================================================================
    const notifyPolygon = () => {
      const coords: LonLat[] = polygonLatLngsRef.current.map((ll) => [ll.lng, ll.lat]);
      if (coords.length < 3) {
        setPolygonInfo(null);
        onPolygonChangedRef.current?.(null);
        return;
      }
      const sel = buildPolygonSelection(coords);
      setPolygonInfo(sel);
      onPolygonChangedRef.current?.(sel);
    };

    const refreshPolygonShape = () => {
      const pts = polygonLatLngsRef.current;
      if (polygonLayerRef.current) {
        polygonLayerRef.current.setLatLngs(pts);
      } else if (pts.length > 0) {
        polygonLayerRef.current = L.polygon(pts, {
          color: POLY_COLOR,
          weight: 2,
          fillOpacity: 0.1,
        }).addTo(map);
      }
    };

    const clearMidpoints = () => {
      polygonMidpointMarkersRef.current.forEach((m) => map.removeLayer(m));
      polygonMidpointMarkersRef.current = [];
    };

    const rebuildMidpoints = () => {
      clearMidpoints();
      const pts = polygonLatLngsRef.current;
      if (pts.length < 2) return;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
        const insertIdx = i + 1;
        const marker = L.marker(mid, {
          icon: midpointIcon,
          draggable: true,
          autoPan: true,
          keyboard: false,
        });
        let inserted = false;
        // PermaBuddy-style stretch: dragging a midpoint inserts a new
        // vertex at insertIdx, then live-updates it as the pointer moves.
        marker.on("dragstart", () => {
          if (inserted) return;
          polygonLatLngsRef.current.splice(insertIdx, 0, marker.getLatLng());
          inserted = true;
          refreshPolygonShape();
        });
        marker.on("drag", () => {
          if (!inserted) return;
          polygonLatLngsRef.current[insertIdx] = marker.getLatLng();
          refreshPolygonShape();
        });
        marker.on("dragend", () => {
          if (!inserted) return;
          rebuildVertices();
          rebuildMidpoints();
          notifyPolygon();
        });
        // Simple click also inserts (kept for accessibility / non-drag taps)
        marker.on("click", () => {
          if (inserted) return;
          polygonLatLngsRef.current.splice(insertIdx, 0, mid);
          rebuildVertices();
          refreshPolygonShape();
          rebuildMidpoints();
          notifyPolygon();
        });
        marker.addTo(map);
        polygonMidpointMarkersRef.current.push(marker);
      }
    };

    const clearVertices = () => {
      polygonVertexMarkersRef.current.forEach((m) => map.removeLayer(m));
      polygonVertexMarkersRef.current = [];
    };

    const rebuildVertices = () => {
      clearVertices();
      const pts = polygonLatLngsRef.current;
      pts.forEach((latlng, idx) => {
        const marker = L.marker(latlng, {
          icon: vertexIcon,
          draggable: true,
          autoPan: true,
        });
        marker.on("drag", (ev) => {
          const m = ev.target as L.Marker;
          polygonLatLngsRef.current[idx] = m.getLatLng();
          refreshPolygonShape();
        });
        marker.on("dragend", () => {
          rebuildMidpoints();
          notifyPolygon();
        });
        marker.on("contextmenu", (ev) => {
          L.DomEvent.preventDefault(ev as unknown as Event);
          if (polygonLatLngsRef.current.length <= 3) return;
          polygonLatLngsRef.current.splice(idx, 1);
          rebuildVertices();
          refreshPolygonShape();
          rebuildMidpoints();
          notifyPolygon();
        });
        marker.addTo(map);
        polygonVertexMarkersRef.current.push(marker);
      });
    };

    const resetPolygon = () => {
      polygonLatLngsRef.current = [];
      clearVertices();
      clearMidpoints();
      if (polygonLayerRef.current) {
        map.removeLayer(polygonLayerRef.current);
        polygonLayerRef.current = null;
      }
      setHasPolygon(false);
      setPolygonInfo(null);
      onPolygonChangedRef.current?.(null);
    };
    // Expose to JSX reset button via a closure on window-less ref
    (resetPolygonRef as React.MutableRefObject<(() => void) | null>).current = resetPolygon;

    const addPolygonVertex = (latlng: L.LatLng) => {
      polygonLatLngsRef.current.push(latlng);
      setPolygonInProgressCount(polygonLatLngsRef.current.length);
      // Light "in progress" preview marker
      const tmp = L.circleMarker(latlng, {
        radius: 5,
        color: POLY_COLOR,
        fillColor: POLY_COLOR,
        fillOpacity: 1,
      }).addTo(map);
      polygonMidpointMarkersRef.current.push(tmp as unknown as L.Marker);
      if (polygonLayerRef.current) {
        polygonLayerRef.current.setLatLngs(polygonLatLngsRef.current);
      } else if (polygonLatLngsRef.current.length >= 2) {
        polygonLayerRef.current = L.polygon(polygonLatLngsRef.current, {
          color: POLY_COLOR,
          weight: 2,
          fillOpacity: 0.1,
          dashArray: "4,4",
        }).addTo(map);
      }
    };

    const finishPolygon = () => {
      if (polygonLatLngsRef.current.length < 3) {
        // Cancel
        resetPolygon();
        drawingPolygonRef.current = false;
        setDrawingPolygon(false);
        setPolygonInProgressCount(0);
        map.getContainer().style.cursor = "";
        map.doubleClickZoom.enable();
        return;
      }
      drawingPolygonRef.current = false;
      setDrawingPolygon(false);
      setPolygonInProgressCount(0);
      map.getContainer().style.cursor = "";
      map.doubleClickZoom.enable();
      // Clear preview markers (we reused midpoints array as scratch)
      clearMidpoints();
      // Replace dashed in-progress polygon with solid one
      if (polygonLayerRef.current) {
        map.removeLayer(polygonLayerRef.current);
        polygonLayerRef.current = null;
      }
      polygonLayerRef.current = L.polygon(polygonLatLngsRef.current, {
        color: POLY_COLOR,
        weight: 2,
        fillOpacity: 0.1,
      }).addTo(map);
      rebuildVertices();
      rebuildMidpoints();
      setHasPolygon(true);
      notifyPolygon();
    };
    (finishPolygonRef as React.MutableRefObject<(() => void) | null>).current = finishPolygon;

    // ========================================================================
    // RECTANGLE DRAWING (mouse + touch)
    // ========================================================================
    const getLatLngFromTouch = (touch: Touch): L.LatLng => {
      const containerPoint = map.mouseEventToContainerPoint({
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as MouseEvent);
      return map.containerPointToLatLng(containerPoint);
    };

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      if (!drawingRef.current) return;
      startLatLngRef.current = e.latlng;
      map.dragging.disable();
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!drawingRef.current || !startLatLngRef.current) return;
      const bounds = L.latLngBounds(startLatLngRef.current, e.latlng);
      if (tempRectRef.current) {
        tempRectRef.current.setBounds(bounds);
      } else {
        tempRectRef.current = L.rectangle(bounds, {
          color: "hsl(152, 45%, 28%)",
          weight: 2,
          fillOpacity: 0.1,
        }).addTo(map);
      }
    };

    const onMouseUp = (e: L.LeafletMouseEvent) => {
      if (!drawingRef.current || !startLatLngRef.current) return;
      map.dragging.enable();
      const bounds = L.latLngBounds(startLatLngRef.current, e.latlng);
      finishRectDraw(bounds);
    };

    const finishRectDraw = (bounds: L.LatLngBounds) => {
      startLatLngRef.current = null;
      if (rectRef.current) map.removeLayer(rectRef.current);
      if (tempRectRef.current) {
        rectRef.current = tempRectRef.current;
        tempRectRef.current = null;
      }
      drawingRef.current = false;
      setDrawing(false);
      map.getContainer().style.cursor = "";

      onBoundsSelected({
        south: bounds.getSouth(),
        north: bounds.getNorth(),
        west: bounds.getWest(),
        east: bounds.getEast(),
      });

      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    };

    const container = map.getContainer();
    const onTouchStart = (e: TouchEvent) => {
      if (!drawingRef.current || e.touches.length !== 1) return;
      e.preventDefault();
      const latlng = getLatLngFromTouch(e.touches[0]);
      startLatLngRef.current = latlng;
      map.dragging.disable();
      map.touchZoom.disable();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!drawingRef.current || !startLatLngRef.current || e.touches.length !== 1) return;
      e.preventDefault();
      const latlng = getLatLngFromTouch(e.touches[0]);
      const bounds = L.latLngBounds(startLatLngRef.current, latlng);
      if (tempRectRef.current) {
        tempRectRef.current.setBounds(bounds);
      } else {
        tempRectRef.current = L.rectangle(bounds, {
          color: "hsl(152, 45%, 28%)",
          weight: 2,
          fillOpacity: 0.1,
        }).addTo(map);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!drawingRef.current || !startLatLngRef.current) return;
      e.preventDefault();
      map.dragging.enable();
      map.touchZoom.enable();
      const lastTouch = e.changedTouches[0];
      const latlng = getLatLngFromTouch(lastTouch);
      const bounds = L.latLngBounds(startLatLngRef.current, latlng);
      finishRectDraw(bounds);
    };

    container.addEventListener("touchstart", onTouchStart, { passive: false });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: false });

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);

    // ========================================================================
    // PROFILE & POLYGON CLICK (shared "map click" handler)
    // ========================================================================
    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (drawingPolygonRef.current) {
        addPolygonVertex(e.latlng);
        return;
      }
      if (drawingProfileRef.current) {
        addProfilePoint(e.latlng);
      }
    };

    const addProfilePoint = (latlng: L.LatLng) => {
      profilePointsRef.current.push(latlng);
      const marker = L.circleMarker(latlng, { radius: 5, color: "#e74c3c", fillColor: "#e74c3c", fillOpacity: 1 }).addTo(map);
      profileMarkersRef.current.push(marker);
      if (profilePolylineRef.current) {
        profilePolylineRef.current.setLatLngs(profilePointsRef.current);
      } else {
        profilePolylineRef.current = L.polyline(profilePointsRef.current, { color: "#e74c3c", weight: 3, dashArray: "6,4" }).addTo(map);
      }
    };

    const finishProfile = () => {
      drawingProfileRef.current = false;
      setDrawingProfile(false);
      map.getContainer().style.cursor = "";
      map.doubleClickZoom.enable();
      const pts = profilePointsRef.current;
      if (pts.length >= 2 && onProfileLineDrawn) {
        onProfileLineDrawn(pts.map((p) => [p.lat, p.lng] as [number, number]));
      }
    };

    const onMapDblClick = () => {
      if (drawingPolygonRef.current) {
        finishPolygon();
        return;
      }
      if (drawingProfileRef.current) {
        finishProfile();
      }
    };

    // Touch (profile + polygon): tap to add, long-press to finish
    let tapTimer: ReturnType<typeof setTimeout> | null = null;
    let touchMoved = false;

    const onSharedTouchStart = (e: TouchEvent) => {
      if ((!drawingProfileRef.current && !drawingPolygonRef.current) || e.touches.length !== 1) return;
      touchMoved = false;
      tapTimer = setTimeout(() => {
        if (!touchMoved) {
          if (drawingPolygonRef.current) finishPolygon();
          else if (drawingProfileRef.current) finishProfile();
        }
        tapTimer = null;
      }, 600);
    };

    const onSharedTouchMove = () => {
      if (!drawingProfileRef.current && !drawingPolygonRef.current) return;
      touchMoved = true;
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
    };

    const onSharedTouchEnd = (e: TouchEvent) => {
      if (!drawingProfileRef.current && !drawingPolygonRef.current) return;
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
      if (!touchMoved && e.changedTouches.length === 1) {
        const latlng = getLatLngFromTouch(e.changedTouches[0]);
        if (drawingPolygonRef.current) addPolygonVertex(latlng);
        else addProfilePoint(latlng);
      }
    };

    container.addEventListener("touchstart", onSharedTouchStart, { passive: true });
    container.addEventListener("touchmove", onSharedTouchMove, { passive: true });
    container.addEventListener("touchend", onSharedTouchEnd, { passive: true });

    map.on("click", onMapClick);
    map.on("dblclick", onMapDblClick);

    // Button click handlers
    setTimeout(() => {
      const exitOtherModes = () => {
        drawingRef.current = false; setDrawing(false);
        drawingProfileRef.current = false; setDrawingProfile(false);
        drawingPolygonRef.current = false; setDrawingPolygon(false);
      };

      const btn = document.getElementById("draw-rect-btn");
      if (btn) {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const next = !drawingRef.current;
          exitOtherModes();
          drawingRef.current = next;
          setDrawing(next);
          map.getContainer().style.cursor = next ? "crosshair" : "";
          if (next) map.doubleClickZoom.enable();
        });
      }

      const polyBtn = document.getElementById("draw-poly-btn");
      if (polyBtn) {
        polyBtn.addEventListener("click", (e) => {
          e.preventDefault();
          const next = !drawingPolygonRef.current;
          exitOtherModes();
          drawingPolygonRef.current = next;
          setDrawingPolygon(next);
          map.getContainer().style.cursor = next ? "crosshair" : "";
          if (next) {
            map.doubleClickZoom.disable();
            // Reset previous polygon if any
            resetPolygon();
            setPolygonInProgressCount(0);
          } else {
            map.doubleClickZoom.enable();
            setPolygonInProgressCount(0);
          }
        });
      }

      const profileBtn = document.getElementById("draw-profile-btn");
      if (profileBtn) {
        profileBtn.addEventListener("click", (e) => {
          e.preventDefault();
          const next = !drawingProfileRef.current;
          exitOtherModes();
          drawingProfileRef.current = next;
          setDrawingProfile(next);
          map.getContainer().style.cursor = next ? "crosshair" : "";
          if (next) {
            map.doubleClickZoom.disable();
            profilePointsRef.current = [];
            if (profilePolylineRef.current) { map.removeLayer(profilePolylineRef.current); profilePolylineRef.current = null; }
            profileMarkersRef.current.forEach((m) => map.removeLayer(m));
            profileMarkersRef.current = [];
          } else {
            map.doubleClickZoom.enable();
          }
        });
      }
    }, 0);

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchstart", onSharedTouchStart);
      container.removeEventListener("touchmove", onSharedTouchMove);
      container.removeEventListener("touchend", onSharedTouchEnd);
      map.remove();
      leafletMapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Highlight point on map from profile hover
  const highlightMarkerRef = useRef<L.CircleMarker | null>(null);
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    if (highlightMarkerRef.current) {
      map.removeLayer(highlightMarkerRef.current);
      highlightMarkerRef.current = null;
    }
    if (highlightPoint) {
      const marker = L.circleMarker([highlightPoint.lat, highlightPoint.lon], {
        radius: 7,
        color: "#e74c3c",
        fillColor: "#e74c3c",
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);
      marker.bindTooltip(
        `${Math.round(highlightPoint.elevation)}m — ${highlightPoint.distance >= 1000 ? (highlightPoint.distance / 1000).toFixed(1) + " km" : Math.round(highlightPoint.distance) + " m"}`,
        { permanent: true, direction: "top", className: "highlight-tooltip" }
      );
      highlightMarkerRef.current = marker;
    }
  }, [highlightPoint]);

  // Render imported GPX/KML track
  const importedTrackLayerRef = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    if (importedTrackLayerRef.current) {
      map.removeLayer(importedTrackLayerRef.current);
      importedTrackLayerRef.current = null;
    }
    if (!importedTrack || importedTrack.points.length < 2) return;

    const group = L.layerGroup().addTo(map);
    const latLngs = importedTrack.points as [number, number][];
    const polyline = L.polyline(latLngs, {
      color: "#2563eb",
      weight: 4,
      opacity: 0.9,
    }).addTo(group);
    if (importedTrack.name) {
      polyline.bindTooltip(importedTrack.name, { sticky: true });
    }
    L.circleMarker(latLngs[0], { radius: 6, color: "#16a34a", fillColor: "#16a34a", fillOpacity: 1 })
      .bindTooltip("Départ", { direction: "top" })
      .addTo(group);
    L.circleMarker(latLngs[latLngs.length - 1], { radius: 6, color: "#dc2626", fillColor: "#dc2626", fillOpacity: 1 })
      .bindTooltip("Arrivée", { direction: "top" })
      .addTo(group);

    importedTrackLayerRef.current = group;
    map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
  }, [importedTrack]);

  // Update center/zoom
  useEffect(() => {
    if (leafletMapRef.current) {
      leafletMapRef.current.setView(center, zoom);
    }
  }, [center, zoom]);

  // Draw contours (with optional polygon clipping)
  useEffect(() => {
    const layer = contourLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!contours) return;

    const contoursState = layers.find((l) => l.id === "contours");
    const labelsState = layers.find((l) => l.id === "labels");
    const showLabels = labelsState?.visible !== false;
    const baseOpacity = contoursState?.opacity ?? 1;
    const clipPoly = polygonInfo?.coordinates ?? null;

    for (const line of contours.lines) {
      if (line.coordinates.length < 2) continue;
      const color = getContourColor(line.elevation, minElev, maxElev);

      const drawPolyline = (coords: [number, number][]) => {
        const latLngs = coords.map(([lon, lat]) => [lat, lon] as [number, number]);
        const polyline = L.polyline(latLngs, {
          color,
          weight: line.isMajor ? 3 : 1,
          opacity: (line.isMajor ? 0.9 : 0.6) * baseOpacity,
        });
        if (line.isMajor && showLabels) {
          polyline.bindTooltip(`${line.elevation}m`, {
            permanent: true,
            direction: "center",
            className: "contour-label",
          });
        }
        polyline.addTo(layer);
      };

      if (clipPoly) {
        const segments = clipPolylineToPolygon(line.coordinates as LonLat[], clipPoly);
        for (const seg of segments) drawPolyline(seg);
      } else {
        drawPolyline(line.coordinates);
      }
    }
  }, [contours, minElev, maxElev, layers, polygonInfo]);

  // Build / refresh slope + aspect raster overlays whenever terrain or polygon changes
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    const removeOverlay = (
      ref: React.MutableRefObject<L.ImageOverlay | null>
    ) => {
      if (ref.current) {
        map.removeLayer(ref.current);
        ref.current = null;
      }
    };
    removeOverlay(slopeOverlayRef);
    removeOverlay(aspectOverlayRef);
    if (!terrain) return;

    const bounds: L.LatLngBoundsLiteral = [
      [terrain.minLat, terrain.minLon],
      [terrain.maxLat, terrain.maxLon],
    ];
    const clip = polygonInfo?.coordinates ?? null;
    const slopeCanvas = renderTerrainCanvas(terrain, "slope", 4, clip);
    const aspectCanvas = renderTerrainCanvas(terrain, "aspect", 4, clip);

    const slopeState = layers.find((l) => l.id === "slope");
    const aspectState = layers.find((l) => l.id === "aspect");

    slopeOverlayRef.current = L.imageOverlay(slopeCanvas.toDataURL(), bounds, {
      opacity: slopeState?.opacity ?? 0.6,
      interactive: false,
    });
    aspectOverlayRef.current = L.imageOverlay(aspectCanvas.toDataURL(), bounds, {
      opacity: aspectState?.opacity ?? 0.6,
      interactive: false,
    });
    if (slopeState?.visible) slopeOverlayRef.current.addTo(map);
    if (aspectState?.visible) aspectOverlayRef.current.addTo(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain, polygonInfo]);

  // Apply layer visibility & opacity to base IGN layers and overlays
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    (Object.keys(externalLayersRef.current) as LayerId[]).forEach((id) => {
      const layer = externalLayersRef.current[id];
      if (!layer) return;
      const state = layers.find((l) => l.id === id);
      if (!state) return;
      if (state.visible) {
        if (!map.hasLayer(layer)) layer.addTo(map);
        setLayerOpacity(layer, state.opacity);
      } else if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });

    const contourState = layers.find((l) => l.id === "contours");
    const cg = contourLayerRef.current;
    if (cg) {
      if (contourState?.visible) {
        if (!map.hasLayer(cg)) cg.addTo(map);
      } else if (map.hasLayer(cg)) {
        map.removeLayer(cg);
      }
    }

    const trackState = layers.find((l) => l.id === "track");
    const tg = importedTrackLayerRef.current;
    if (tg) {
      if (trackState?.visible) {
        if (!map.hasLayer(tg)) tg.addTo(map);
        tg.eachLayer((lyr) => {
          if ((lyr as L.Path).setStyle) {
            (lyr as L.Path).setStyle({ opacity: trackState.opacity, fillOpacity: trackState.opacity });
          }
        });
      } else if (map.hasLayer(tg)) {
        map.removeLayer(tg);
      }
    }

    // Slope + aspect raster overlays
    const applyOverlay = (
      id: "slope" | "aspect",
      ref: React.MutableRefObject<L.ImageOverlay | null>
    ) => {
      const state = layers.find((l) => l.id === id);
      const ov = ref.current;
      if (!ov || !state) return;
      if (state.visible) {
        if (!map.hasLayer(ov)) ov.addTo(map);
        ov.setOpacity(state.opacity);
      } else if (map.hasLayer(ov)) {
        map.removeLayer(ov);
      }
    };
    applyOverlay("slope", slopeOverlayRef);
    applyOverlay("aspect", aspectOverlayRef);
  }, [layers, contours, importedTrack]);

  // Selection ↔ viewport coherence watchdog
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    const evaluate = () => {
      if (!selectedBounds) {
        setSelectionOffscreen(false);
        setSelectionInfo(null);
        return;
      }
      const { south, north, west, east } = selectedBounds;
      const sw = L.latLng(south, west);
      const nw = L.latLng(north, west);
      const se = L.latLng(south, east);
      const widthM = sw.distanceTo(se);
      const heightM = sw.distanceTo(nw);
      setSelectionInfo({ widthM, heightM });

      const selBounds = L.latLngBounds(sw, L.latLng(north, east));
      const viewBounds = map.getBounds();
      const intersects = viewBounds.intersects(selBounds);

      const pSW = map.latLngToContainerPoint(sw);
      const pSE = map.latLngToContainerPoint(se);
      const projectedWidthPx = Math.abs(pSE.x - pSW.x);
      const viewportWidthPx = map.getSize().x;

      const tooSmall = projectedWidthPx < viewportWidthPx * 0.05;
      setSelectionOffscreen(!intersects || tooSmall);
    };

    evaluate();
    map.on("moveend", evaluate);
    map.on("zoomend", evaluate);
    return () => {
      map.off("moveend", evaluate);
      map.off("zoomend", evaluate);
    };
  }, [selectedBounds]);

  const formatMeters = (m: number) =>
    m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;

  const recenterOnSelection = () => {
    const map = leafletMapRef.current;
    if (!map || !selectedBounds) return;
    const { south, north, west, east } = selectedBounds;
    map.fitBounds(L.latLngBounds(L.latLng(south, west), L.latLng(north, east)), {
      padding: [40, 40],
      maxZoom: 17,
    });
  };

  const handleResetPolygon = useCallback(() => {
    resetPolygonRef.current?.();
    setHasPolygon(false);
  }, []);

  return (
    <>
      <div
        ref={mapRef}
        className="w-full h-full"
        style={{ minHeight: "400px", position: "absolute", inset: 0 }}
      />
      {drawing && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-card text-foreground text-xs sm:text-sm px-3 py-1.5 rounded-md shadow-md border border-border max-w-[90vw] text-center">
          Touchez et glissez pour dessiner un rectangle
        </div>
      )}
      {drawingPolygon && (
        <>
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-card text-foreground text-xs sm:text-sm px-3 py-1.5 rounded-md shadow-md border border-border max-w-[90vw] text-center">
            Cliquez pour ajouter un sommet ({polygonInProgressCount}) — minimum 3
          </div>
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2">
            <button
              onClick={() => finishPolygonRef.current?.()}
              disabled={polygonInProgressCount < 3}
              className="bg-primary text-primary-foreground text-xs sm:text-sm px-4 py-2 rounded-md shadow-md font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              ✓ Valider la zone
            </button>
            <button
              onClick={() => {
                resetPolygonRef.current?.();
                setPolygonInProgressCount(0);
                setDrawingPolygon(false);
                drawingPolygonRef.current = false;
                leafletMapRef.current?.getContainer().style.setProperty("cursor", "");
                leafletMapRef.current?.doubleClickZoom.enable();
              }}
              className="bg-card text-foreground text-xs sm:text-sm px-3 py-2 rounded-md shadow-md border border-border hover:bg-muted transition-colors"
            >
              Annuler
            </button>
          </div>
        </>
      )}
      {drawingProfile && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-card text-foreground text-xs sm:text-sm px-3 py-1.5 rounded-md shadow-md border border-border max-w-[90vw] text-center">
          Touchez pour tracer — appui long pour terminer
        </div>
      )}
      {hasPolygon && (
        <button
          onClick={handleResetPolygon}
          className="absolute top-2 right-2 z-[1000] bg-card text-foreground text-xs px-3 min-h-[44px] rounded-md shadow-md border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          Réinitialiser le polygone
        </button>
      )}
      {polygonInfo && (
        <div className="absolute left-1/2 -translate-x-1/2 z-[1200] bg-card text-foreground text-xs px-2.5 py-1.5 rounded-md shadow-md border border-border bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] md:bottom-2">
          Polygone : {polygonInfo.coordinates.length} sommets — {polygonInfo.areaKm2.toFixed(2)} km²
        </div>
      )}
      {selectionInfo && !polygonInfo && (
        <div className="absolute right-2 z-[1200] bg-card text-foreground text-xs px-2.5 py-1.5 rounded-md shadow-md border border-border bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] md:bottom-2">
          Zone : {formatMeters(selectionInfo.widthM)} × {formatMeters(selectionInfo.heightM)}
        </div>
      )}
      {selectionOffscreen && selectedBounds && !polygonInfo && (
        <button
          onClick={recenterOnSelection}
          className="absolute right-2 z-[1200] bg-card text-foreground text-xs px-3 min-h-[44px] rounded-md shadow-md border border-border hover:bg-accent hover:text-accent-foreground transition-colors bottom-[calc(env(safe-area-inset-bottom)+7.5rem)] md:bottom-12"
        >
          Recadrer sur la zone
        </button>
      )}
    </>
  );
}
