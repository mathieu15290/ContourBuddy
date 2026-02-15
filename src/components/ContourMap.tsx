import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";
import "leaflet-draw";
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
}: Props) {
  const leafletMapRef = useRef<L.Map | null>(null);
  const contourLayerRef = useRef<L.LayerGroup | null>(null);
  const drawnLayerRef = useRef<L.FeatureGroup | null>(null);
  const [baseLayer, setBaseLayer] = useState<"plan" | "satellite" | "cadastre">("plan");

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    const map = L.map(mapRef.current, {
      center,
      zoom,
      zoomControl: true,
    });

    // IGN plan layer
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

    // Layer control
    const baseLayers: Record<string, L.TileLayer> = {
      "Plan IGN": planLayer,
      "Satellite": satelliteLayer,
      "Cadastre": cadastreLayer,
    };
    L.control.layers(baseLayers).addTo(map);

    // Drawing controls
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnLayerRef.current = drawnItems;

    const drawControl = new L.Control.Draw({
      position: "topleft",
      draw: {
        polygon: false,
        circle: false,
        circlemarker: false,
        marker: false,
        polyline: false,
        rectangle: {
          shapeOptions: {
            color: "hsl(152, 45%, 28%)",
            weight: 2,
            fillOpacity: 0.1,
          },
        },
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (e: any) => {
      drawnItems.clearLayers();
      const layer = e.layer;
      drawnItems.addLayer(layer);
      const bounds = layer.getBounds();
      onBoundsSelected({
        south: bounds.getSouth(),
        north: bounds.getNorth(),
        west: bounds.getWest(),
        east: bounds.getEast(),
      });
    });

    // Contour layer group
    contourLayerRef.current = L.layerGroup().addTo(map);

    leafletMapRef.current = map;

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

      // Tooltip on major contours
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

  // Draw selected bounds rectangle
  useEffect(() => {
    if (!selectedBounds || !drawnLayerRef.current) return;
    // Already drawn by the draw handler
  }, [selectedBounds]);

  return (
    <div
      ref={mapRef}
      className="w-full h-full"
      style={{ minHeight: "400px", position: "absolute", inset: 0 }}
    />
  );
}
