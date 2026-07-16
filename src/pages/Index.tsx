import { useState, useRef, useCallback, useMemo } from "react";
import { AddressSearch } from "@/components/AddressSearch";
import { ContourMap } from "@/components/ContourMap";
import { ControlPanel } from "@/components/ControlPanel";
import { ElevationProfile, type ProfilePoint } from "@/components/ElevationProfile";
import { fetchElevationGrid, fetchElevationAlongLine, smoothElevationGrid, type ElevationGrid } from "@/lib/elevation";
import { generateContours, type ContourResult } from "@/lib/contours";
import { exportGeoJSON, exportDXF, exportKML, exportPNG, exportSVG } from "@/lib/export-utils";
import { parseTrackFile, trackBounds, type TrackPoint } from "@/lib/track-import";
import { LayersPanel } from "@/components/LayersPanel";
import { DEFAULT_LAYERS, type LayerState, type LayerId } from "@/lib/layers";
import type { PolygonSelection } from "@/lib/polygon-utils";
import { computeTerrain, type TerrainGrid } from "@/lib/terrain";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/hooks/use-theme";
import { Moon, Sun, Upload, MoreVertical, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import logo from "@/assets/logo.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Bounds = { south: number; north: number; west: number; east: number };

const Index = () => {
  const [center, setCenter] = useState<[number, number]>([46.6, 2.5]);
  const [zoom, setZoom] = useState(6);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [interval, setInterval] = useState(5);
  const [contours, setContours] = useState<ContourResult | null>(null);
  const [grid, setGrid] = useState<ElevationGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [minElev, setMinElev] = useState(0);
  const [maxElev, setMaxElev] = useState(0);
  const [profileData, setProfileData] = useState<ProfilePoint[] | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [hoveredProfilePoint, setHoveredProfilePoint] = useState<ProfilePoint | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [importedTrack, setImportedTrack] = useState<{ points: TrackPoint[]; name: string } | null>(null);
  const [layers, setLayers] = useState<LayerState[]>(DEFAULT_LAYERS);
  const [polygon, setPolygon] = useState<PolygonSelection | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const { dark, toggle: toggleTheme } = useTheme();

  const terrain: TerrainGrid | null = useMemo(
    () => (grid ? computeTerrain(grid) : null),
    [grid]
  );

  const handleAddressSelect = useCallback((lon: number, lat: number, label: string) => {
    setCenter([lat, lon]);
    setZoom(15);
  }, []);

  const handleBoundsSelected = useCallback((b: Bounds) => {
    setBounds(b);
    setContours(null);
    setGrid(null);
  }, []);

  const handlePolygonChanged = useCallback((p: PolygonSelection | null) => {
    setPolygon(p);
    if (p) {
      setBounds(p.bounds);
      setContours(null);
      setGrid(null);
    }
  }, []);

  const calculateArea = (b: Bounds): number => {
    const R = 6371;
    const dLat = ((b.north - b.south) * Math.PI) / 180;
    const dLon = ((b.east - b.west) * Math.PI) / 180;
    const midLat = ((b.north + b.south) / 2 * Math.PI) / 180;
    const width = dLon * R * Math.cos(midLat);
    const height = dLat * R;
    return Math.abs(width * height);
  };

  const handleGenerate = useCallback(async () => {
    if (!bounds) return;
    setLoading(true);
    setProgress(0);
    setContours(null);
    try {
      const resolution = interval <= 1 ? 120 : interval <= 5 ? 90 : interval <= 10 ? 70 : 50;
      const rawGrid = await fetchElevationGrid(bounds, resolution, (pct) => setProgress(pct));
      const g = smoothElevationGrid(rawGrid, interval <= 5 ? 1 : 2);
      setGrid(g);
      setMinElev(g.minElev);
      setMaxElev(g.maxElev);
      const majorEvery = interval <= 5 ? 5 : 4;
      const result = generateContours(g, interval, majorEvery);
      setContours(result);
      toast({
        title: "Courbes générées",
        description: `${result.lines.length} courbes créées (${Math.round(g.minElev)}m – ${Math.round(g.maxElev)}m)`,
      });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Erreur lors de la génération", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [bounds, interval, toast]);

  const handleExportPNG = useCallback(async () => {
    if (!mapContainerRef.current) return;
    try { await exportPNG(mapContainerRef.current); }
    catch { toast({ title: "Erreur", description: "Export PNG échoué", variant: "destructive" }); }
  }, [toast]);

  const handleProfileLineDrawn = useCallback(async (waypoints: [number, number][]) => {
    setProfileLoading(true);
    setProfileData(null);
    try {
      const data = await fetchElevationAlongLine(waypoints, 150, () => {});
      setProfileData(data);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || "Erreur profil", variant: "destructive" });
    } finally {
      setProfileLoading(false);
    }
  }, [toast]);

  const handleImportTrack = useCallback(async (file: File) => {
    try {
      const track = await parseTrackFile(file);
      setImportedTrack({ points: track.points, name: track.name });
      // Derive a bounding box around the track (with small padding) so the user
      // can immediately generate contours along their route without drawing a rectangle.
      const tb = trackBounds(track.points);
      const padLat = Math.max((tb.north - tb.south) * 0.1, 0.002);
      const padLon = Math.max((tb.east - tb.west) * 0.1, 0.002);
      setBounds({
        south: tb.south - padLat,
        north: tb.north + padLat,
        west: tb.west - padLon,
        east: tb.east + padLon,
      });
      setContours(null);
      toast({
        title: "Trace importée",
        description: `${track.name} — ${track.points.length} points`,
      });
      // Generate elevation profile from track
      await handleProfileLineDrawn(track.points);
    } catch (err: any) {
      toast({ title: "Import échoué", description: err.message || "Fichier invalide", variant: "destructive" });
    }
  }, [toast, handleProfileLineDrawn]);

  const updateLayer = useCallback((id: LayerId, patch: Partial<LayerState>) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const controlPanelProps = {
    interval,
    onIntervalChange: setInterval,
    hasBounds: !!bounds,
    loading,
    progress,
    onGenerate: handleGenerate,
    contours,
    minElev,
    maxElev,
    area: polygon ? polygon.areaKm2 : bounds ? calculateArea(bounds) : 0,
    centroid: polygon
      ? { lat: polygon.bounds.south + (polygon.bounds.north - polygon.bounds.south) / 2, lon: polygon.bounds.west + (polygon.bounds.east - polygon.bounds.west) / 2 }
      : bounds
        ? { lat: (bounds.north + bounds.south) / 2, lon: (bounds.east + bounds.west) / 2 }
        : null,
    onExportGeoJSON: () => contours && exportGeoJSON(contours),
    onExportDXF: () => contours && exportDXF(contours),
    onExportKML: () => contours && exportKML(contours),
    onExportSVG: () => contours && exportSVG(contours, "courbes-niveaux", polygon),
    onExportPNG: handleExportPNG,
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-2 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3 shrink-0 safe-top safe-x">
        <div className="flex items-center gap-2 shrink-0">
          <img src={logo} alt="Logo" className="h-7 w-7 sm:h-8 sm:w-8" />
          <h1 className="hidden xs:block sm:block text-base sm:text-lg font-bold text-foreground tracking-tight">
            <span className="hidden sm:inline">ContourBuddyApp</span>
            <span className="sm:hidden">CB</span>
          </h1>
        </div>
        <div className="flex-1 max-w-lg ml-1 sm:ml-4 min-w-0">
          <AddressSearch onSelect={handleAddressSelect} />
        </div>
        <div className="flex items-center gap-1 sm:gap-2 ml-auto shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml,text/xml,application/xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportTrack(f);
              e.target.value = "";
            }}
          />
          {/* Desktop / tablet actions */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Importer une trace GPX ou KML"
            className="hidden sm:inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted text-foreground text-sm transition-colors"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden md:inline">Importer GPX/KML</span>
          </button>
          <p className="hidden lg:block text-xs text-muted-foreground">
            Données © IGN – RGE ALTI®
          </p>
          <button
            onClick={toggleTheme}
            title={dark ? "Thème clair" : "Thème sombre"}
            className="hidden sm:inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md hover:bg-muted transition-colors text-muted-foreground"
          >
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {/* Mobile: actions secondaires regroupées */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="sm:hidden inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md hover:bg-muted text-foreground"
                aria-label="Plus d'actions"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="min-h-[44px] text-sm">
                <Upload className="h-4 w-4 mr-2" /> Importer GPX/KML
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleTheme} className="min-h-[44px] text-sm">
                {dark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                {dark ? "Thème clair" : "Thème sombre"}
              </DropdownMenuItem>
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                Données © IGN – RGE ALTI®
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Desktop / Tablet Sidebar (collapsible on tablet) */}
        {!sidebarCollapsed && (
          <aside className="w-72 sm:w-80 border-r border-border bg-card overflow-y-auto p-4 shrink-0 safe-x">
            <ControlPanel {...controlPanelProps} />
            {!bounds && !contours && (
              <div className="mt-6 text-center text-sm text-muted-foreground px-2">
                <p className="mb-2">👆 Utilisez l'outil rectangle sur la carte pour sélectionner une zone</p>
                <p>Puis cliquez sur "Générer les courbes" pour obtenir les courbes de niveaux.</p>
              </div>
            )}
          </aside>
        )}

        {/* Map */}
        <main className="flex-1 relative" style={{ overscrollBehavior: "none" }}>
          {/* Bouton repli/dépli sidebar */}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? "Afficher le panneau" : "Masquer le panneau"}
            className="inline-flex items-center justify-center absolute top-2 left-2 z-[1000] min-h-[44px] min-w-[44px] rounded-md bg-card border border-border shadow-md text-foreground hover:bg-muted transition-colors"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>

          <ContourMap
            center={center}
            zoom={zoom}
            contours={contours}
            minElev={minElev}
            maxElev={maxElev}
            onBoundsSelected={handleBoundsSelected}
            selectedBounds={bounds}
            mapRef={mapContainerRef}
            onProfileLineDrawn={handleProfileLineDrawn}
            highlightPoint={hoveredProfilePoint}
            importedTrack={importedTrack}
            layers={layers}
            onPolygonChanged={handlePolygonChanged}
            terrain={terrain}
          />

          <LayersPanel layers={layers} onChange={updateLayer} />

          {profileLoading && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-card text-foreground text-sm px-4 py-2 rounded-md shadow-md border border-border">
              Chargement du profil...
            </div>
          )}

          {profileData && !profileLoading && (
            <ElevationProfile data={profileData} onClose={() => { setProfileData(null); setImportedTrack(null); }} onHoverPoint={setHoveredProfilePoint} />
          )}

        </main>
      </div>
    </div>
  );
};

export default Index;
