import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";
import type { ContourResult } from "@/lib/contours";
import { getContourColor } from "@/lib/contours";

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

    // Custom draw rectangle button
    const DrawControl = L.Control.extend({
      options: { position: "topleft" as L.ControlPosition },
      onAdd() {
        const container = L.DomUtil.create("div", "leaflet-bar");
        container.innerHTML = `
          <a href="#" title="Dessiner un rectangle" style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;font-size:18px;cursor:pointer;background:white;" id="draw-rect-btn">▭</a>
          <a href="#" title="Dessiner un profil altimétrique" style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;font-size:16px;cursor:pointer;background:white;" id="draw-profile-btn">📈</a>
        `;
        L.DomEvent.disableClickPropagation(container);
        return container;
      },
    });
    new DrawControl().addTo(map);

    contourLayerRef.current = L.layerGroup().addTo(map);
    leafletMapRef.current = map;

    // Draw rectangle handlers
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
      startLatLngRef.current = null;

      if (rectRef.current) map.removeLayer(rectRef.current);
      if (tempRectRef.current) {
        rectRef.current = tempRectRef.current;
        tempRectRef.current = null;
      }

      drawingRef.current = false;
      setDrawing(false);
      map.getContainer().style.cursor = "";

      const b = bounds;
      onBoundsSelected({
        south: b.getSouth(),
        north: b.getNorth(),
        west: b.getWest(),
        east: b.getEast(),
      });
    };

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);

    // Profile drawing handlers
    const onProfileClick = (e: L.LeafletMouseEvent) => {
      if (!drawingProfileRef.current) return;
      profilePointsRef.current.push(e.latlng);
      const marker = L.circleMarker(e.latlng, { radius: 4, color: "#e74c3c", fillColor: "#e74c3c", fillOpacity: 1 }).addTo(map);
      profileMarkersRef.current.push(marker);
      if (profilePolylineRef.current) {
        profilePolylineRef.current.setLatLngs(profilePointsRef.current);
      } else {
        profilePolylineRef.current = L.polyline(profilePointsRef.current, { color: "#e74c3c", weight: 3, dashArray: "6,4" }).addTo(map);
      }
    };

    const onProfileDblClick = () => {
      if (!drawingProfileRef.current) return;
      drawingProfileRef.current = false;
      setDrawingProfile(false);
      map.getContainer().style.cursor = "";
      map.doubleClickZoom.enable();
      const pts = profilePointsRef.current;
      if (pts.length >= 2 && onProfileLineDrawn) {
        onProfileLineDrawn(pts.map((p) => [p.lat, p.lng] as [number, number]));
      }
    };

    map.on("click", onProfileClick);
    map.on("dblclick", onProfileDblClick);

    // Button click handlers
    setTimeout(() => {
      const btn = document.getElementById("draw-rect-btn");
      if (btn) {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          // Cancel profile mode if active
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
          // Cancel rect mode if active
          drawingRef.current = false;
          setDrawing(false);
          drawingProfileRef.current = !drawingProfileRef.current;
          setDrawingProfile(drawingProfileRef.current);
          map.getContainer().style.cursor = drawingProfileRef.current ? "crosshair" : "";
          if (drawingProfileRef.current) {
            map.doubleClickZoom.disable();
            // Clear previous profile line
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
      map.remove();
      leafletMapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-card text-foreground text-sm px-3 py-1.5 rounded-md shadow-md border border-border">
          Cliquez et glissez pour dessiner un rectangle
        </div>
      )}
      {drawingProfile && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-card text-foreground text-sm px-3 py-1.5 rounded-md shadow-md border border-border">
          Cliquez pour tracer une ligne — double-clic pour terminer
        </div>
      )}
    </>
  );
}
