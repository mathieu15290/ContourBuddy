import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";
import type { ContourResult } from "@/lib/contours";
import { getContourColor } from "@/lib/contours";

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
}: Props) {
  const leafletMapRef = useRef<L.Map | null>(null);
  const contourLayerRef = useRef<L.LayerGroup | null>(null);
  const rectRef = useRef<L.Rectangle | null>(null);
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false);
  const startLatLngRef = useRef<L.LatLng | null>(null);
  const tempRectRef = useRef<L.Rectangle | null>(null);

  // Profile drawing state
  const [drawingProfile, setDrawingProfile] = useState(false);
  const drawingProfileRef = useRef(false);
  const profilePointsRef = useRef<L.LatLng[]>([]);
  const profilePolylineRef = useRef<L.Polyline | null>(null);
  const profileMarkersRef = useRef<L.CircleMarker[]>([]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    const map = L.map(mapRef.current, {
      center,
      zoom,
      zoomControl: true,
      tap: true,
    });

    const planLayer = L.tileLayer(
      "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
      { maxZoom: 19, attribution: "© IGN" }
    );

    const satelliteLayer = L.tileLayer(
      "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
      { maxZoom: 19, attribution: "© IGN" }
    );

    const cadastreLayer = L.tileLayer(
      "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=PCI vecteur&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
      { maxZoom: 19, attribution: "© IGN", opacity: 0.7 }
    );

    planLayer.addTo(map);

    L.control.layers({
      "Plan IGN": planLayer,
      "Satellite": satelliteLayer,
      "Cadastre": cadastreLayer,
    }).addTo(map);

    // Custom draw buttons — larger touch targets on mobile
    const DrawControl = L.Control.extend({
      options: { position: "topleft" as L.ControlPosition },
      onAdd() {
        const container = L.DomUtil.create("div", "leaflet-bar");
        container.innerHTML = `
          <a href="#" title="Dessiner un rectangle" style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;font-size:20px;cursor:pointer;background:white;" id="draw-rect-btn">▭</a>
          <a href="#" title="Dessiner un profil altimétrique" style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;font-size:18px;cursor:pointer;background:white;" id="draw-profile-btn">📈</a>
        `;
        L.DomEvent.disableClickPropagation(container);
        return container;
      },
    });
    new DrawControl().addTo(map);

    contourLayerRef.current = L.layerGroup().addTo(map);
    leafletMapRef.current = map;

    // === RECTANGLE DRAWING (mouse + touch) ===
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
    };

    // Touch handlers for rectangle
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

    // === PROFILE DRAWING ===
    const onProfileClick = (e: L.LeafletMouseEvent) => {
      if (!drawingProfileRef.current) return;
      addProfilePoint(e.latlng);
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

    const onProfileDblClick = () => {
      if (!drawingProfileRef.current) return;
      finishProfile();
    };

    // Touch: tap to add point, long-press to finish
    let profileTapTimer: ReturnType<typeof setTimeout> | null = null;
    let profileTouchMoved = false;

    const onProfileTouchStart = (e: TouchEvent) => {
      if (!drawingProfileRef.current || e.touches.length !== 1) return;
      profileTouchMoved = false;
      profileTapTimer = setTimeout(() => {
        // Long press = finish profile
        if (!profileTouchMoved && drawingProfileRef.current) {
          finishProfile();
        }
        profileTapTimer = null;
      }, 600);
    };

    const onProfileTouchMove = () => {
      if (!drawingProfileRef.current) return;
      profileTouchMoved = true;
      if (profileTapTimer) { clearTimeout(profileTapTimer); profileTapTimer = null; }
    };

    const onProfileTouchEnd = (e: TouchEvent) => {
      if (!drawingProfileRef.current) return;
      if (profileTapTimer) { clearTimeout(profileTapTimer); profileTapTimer = null; }
      if (!profileTouchMoved && e.changedTouches.length === 1) {
        const latlng = getLatLngFromTouch(e.changedTouches[0]);
        addProfilePoint(latlng);
      }
    };

    container.addEventListener("touchstart", onProfileTouchStart, { passive: true });
    container.addEventListener("touchmove", onProfileTouchMove, { passive: true });
    container.addEventListener("touchend", onProfileTouchEnd, { passive: true });

    map.on("click", onProfileClick);
    map.on("dblclick", onProfileDblClick);

    // Button click handlers
    setTimeout(() => {
      const btn = document.getElementById("draw-rect-btn");
      if (btn) {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          drawingProfileRef.current = false;
          setDrawingProfile(false);
          drawingRef.current = !drawingRef.current;
          setDrawing(drawingRef.current);
          map.getContainer().style.cursor = drawingRef.current ? "crosshair" : "";
          if (drawingRef.current) map.doubleClickZoom.enable();
        });
      }
      const profileBtn = document.getElementById("draw-profile-btn");
      if (profileBtn) {
        profileBtn.addEventListener("click", (e) => {
          e.preventDefault();
          drawingRef.current = false;
          setDrawing(false);
          drawingProfileRef.current = !drawingProfileRef.current;
          setDrawingProfile(drawingProfileRef.current);
          map.getContainer().style.cursor = drawingProfileRef.current ? "crosshair" : "";
          if (drawingProfileRef.current) {
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
      container.removeEventListener("touchstart", onProfileTouchStart);
      container.removeEventListener("touchmove", onProfileTouchMove);
      container.removeEventListener("touchend", onProfileTouchEnd);
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

  // Update center/zoom
  useEffect(() => {
    if (leafletMapRef.current) {
      leafletMapRef.current.setView(center, zoom);
    }
  }, [center, zoom]);

  // Draw contours
  useEffect(() => {
    const layer = contourLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!contours) return;

    for (const line of contours.lines) {
      if (line.coordinates.length < 2) continue;
      const latLngs = line.coordinates.map(
        ([lon, lat]) => [lat, lon] as [number, number]
      );
      const color = getContourColor(line.elevation, minElev, maxElev);
      const polyline = L.polyline(latLngs, {
        color,
        weight: line.isMajor ? 3 : 1,
        opacity: line.isMajor ? 0.9 : 0.6,
      });
      if (line.isMajor) {
        polyline.bindTooltip(`${line.elevation}m`, {
          permanent: true,
          direction: "center",
          className: "contour-label",
        });
      }
      polyline.addTo(layer);
    }
  }, [contours, minElev, maxElev]);

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
      {drawingProfile && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-card text-foreground text-xs sm:text-sm px-3 py-1.5 rounded-md shadow-md border border-border max-w-[90vw] text-center">
          Touchez pour tracer — appui long pour terminer
        </div>
      )}
    </>
  );
}
