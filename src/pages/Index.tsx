import { useState, useRef, useCallback } from "react";
import { AddressSearch } from "@/components/AddressSearch";
import { ContourMap } from "@/components/ContourMap";
import { ControlPanel } from "@/components/ControlPanel";
import { ElevationProfile, type ProfilePoint } from "@/components/ElevationProfile";
import { fetchElevationGrid, fetchElevationAlongLine, type ElevationGrid } from "@/lib/elevation";
import { generateContours, type ContourResult } from "@/lib/contours";
import { exportGeoJSON, exportDXF, exportKML, exportPNG } from "@/lib/export-utils";
import { parseTrackFile, trackBounds, type TrackPoint } from "@/lib/track-import";
import { LayersPanel } from "@/components/LayersPanel";
import { DEFAULT_LAYERS, type LayerState, type LayerId } from "@/lib/layers";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/hooks/use-theme";
import { ChevronUp, ChevronDown, Moon, Sun, Upload } from "lucide-react";
import logo from "@/assets/logo.png";

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
  const [mobilePanel, setMobilePanel] = useState(false);
  const [importedTrack, setImportedTrack] = useState<{ points: TrackPoint[]; name: string } | null>(null);
  const [layers, setLayers] = useState<LayerState[]>(DEFAULT_LAYERS);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const { dark, toggle: toggleTheme } = useTheme();

  const handleAddressSelect = useCallback((lon: number, lat: number, label: string) => {
    setCenter([lat, lon]);
    setZoom(15);
  }, []);

  const handleBoundsSelected = useCallback((b: Bounds) => {
    setBounds(b);
    setContours(null);
    setGrid(null);
    // Auto-open panel on mobile when bounds selected
    setMobilePanel(true);
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
      const g = await fetchElevationGrid(bounds, resolution, (pct) => setProgress(pct));
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
    area: bounds ? calculateArea(bounds) : 0,
    onExportGeoJSON: () => contours && exportGeoJSON(contours),
    onExportDXF: () => contours && exportDXF(contours),
    onExportKML: () => contours && exportKML(contours),
    onExportPNG: handleExportPNG,
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <img src={logo} alt="Logo" className="h-7 w-7 sm:h-8 sm:w-8" />
          <h1 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
            ContourBuddyApp
          </h1>
        </div>
        <div className="flex-1 max-w-lg ml-2 sm:ml-4">
          <AddressSearch onSelect={handleAddressSelect} />
        </div>
        <div className="flex items-center gap-2 ml-auto">
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
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Importer une trace GPX ou KML"
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted text-foreground text-xs sm:text-sm transition-colors"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Importer GPX/KML</span>
          </button>
          <p className="hidden lg:block text-xs text-muted-foreground">
            Données © IGN – RGE ALTI®
          </p>
          <button onClick={toggleTheme} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Desktop Sidebar */}
        <aside className="w-80 border-r border-border bg-card overflow-y-auto p-4 shrink-0 hidden md:block">
          <ControlPanel {...controlPanelProps} />
          {!bounds && !contours && (
            <div className="mt-6 text-center text-sm text-muted-foreground px-2">
              <p className="mb-2">👆 Utilisez l'outil rectangle sur la carte pour sélectionner une zone</p>
              <p>Puis cliquez sur "Générer les courbes" pour obtenir les courbes de niveaux.</p>
            </div>
          )}
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
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

          {/* Mobile bottom sheet toggle */}
          <div className="md:hidden absolute bottom-3 left-3 right-3 z-[1000] flex flex-col gap-2">
            {mobilePanel && (
              <div className="bg-card border border-border rounded-xl shadow-lg p-3 max-h-[60vh] overflow-y-auto">
                <ControlPanel {...controlPanelProps} />
              </div>
            )}
            <button
              onClick={() => setMobilePanel((v) => !v)}
              className="self-center flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg text-sm font-medium"
            >
              <img src={logo} alt="" className="h-4 w-4" />
              {mobilePanel ? "Fermer" : bounds ? "Paramètres" : "Sélectionnez une zone"}
              {mobilePanel ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
