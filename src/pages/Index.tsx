import { useState, useRef, useCallback } from "react";
import { AddressSearch } from "@/components/AddressSearch";
import { ContourMap } from "@/components/ContourMap";
import { ControlPanel } from "@/components/ControlPanel";
import { fetchElevationGrid } from "@/lib/elevation";
import { generateContours, type ContourResult } from "@/lib/contours";
import { exportGeoJSON, exportDXF, exportKML, exportPNG } from "@/lib/export-utils";
import { useToast } from "@/hooks/use-toast";
import { Mountain } from "lucide-react";

type Bounds = { south: number; north: number; west: number; east: number };

const Index = () => {
  const [center, setCenter] = useState<[number, number]>([46.6, 2.5]);
  const [zoom, setZoom] = useState(6);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [interval, setInterval] = useState(5);
  const [contours, setContours] = useState<ContourResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [minElev, setMinElev] = useState(0);
  const [maxElev, setMaxElev] = useState(0);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();

  const handleAddressSelect = useCallback((lon: number, lat: number, label: string) => {
    setCenter([lat, lon]);
    setZoom(15);
  }, []);

  const handleBoundsSelected = useCallback((b: Bounds) => {
    setBounds(b);
    setContours(null);
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
      const grid = await fetchElevationGrid(bounds, 50, (pct) => setProgress(pct));
      setMinElev(grid.minElev);
      setMaxElev(grid.maxElev);

      const majorEvery = interval <= 5 ? 5 : 4;
      const result = generateContours(grid, interval, majorEvery);
      setContours(result);

      toast({
        title: "Courbes générées",
        description: `${result.lines.length} courbes de niveaux créées (${Math.round(grid.minElev)}m – ${Math.round(grid.maxElev)}m)`,
      });
    } catch (err: any) {
      toast({
        title: "Erreur",
        description: err.message || "Erreur lors de la génération",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [bounds, interval, toast]);

  const handleExportPNG = useCallback(async () => {
    if (!mapContainerRef.current) return;
    try {
      await exportPNG(mapContainerRef.current);
    } catch {
      toast({ title: "Erreur", description: "Export PNG échoué", variant: "destructive" });
    }
  }, [toast]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Mountain className="h-6 w-6 text-primary" />
          <h1 className="text-lg font-bold text-foreground tracking-tight">
            TopoContour
          </h1>
        </div>
        <div className="flex-1 max-w-lg ml-4">
          <AddressSearch onSelect={handleAddressSelect} />
        </div>
        <p className="hidden md:block text-xs text-muted-foreground ml-auto">
          Données d'élévation © IGN – RGE ALTI®
        </p>
      </header>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r border-border bg-card overflow-y-auto p-4 shrink-0 hidden md:block">
          <ControlPanel
            interval={interval}
            onIntervalChange={setInterval}
            hasBounds={!!bounds}
            loading={loading}
            progress={progress}
            onGenerate={handleGenerate}
            contours={contours}
            minElev={minElev}
            maxElev={maxElev}
            area={bounds ? calculateArea(bounds) : 0}
            onExportGeoJSON={() => contours && exportGeoJSON(contours)}
            onExportDXF={() => contours && exportDXF(contours)}
            onExportKML={() => contours && exportKML(contours)}
            onExportPNG={handleExportPNG}
          />

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
          />

          {/* Mobile controls */}
          <div className="md:hidden absolute bottom-4 left-4 right-4 z-[1000]">
            <ControlPanel
              interval={interval}
              onIntervalChange={setInterval}
              hasBounds={!!bounds}
              loading={loading}
              progress={progress}
              onGenerate={handleGenerate}
              contours={contours}
              minElev={minElev}
              maxElev={maxElev}
              area={bounds ? calculateArea(bounds) : 0}
              onExportGeoJSON={() => contours && exportGeoJSON(contours)}
              onExportDXF={() => contours && exportDXF(contours)}
              onExportKML={() => contours && exportKML(contours)}
              onExportPNG={handleExportPNG}
            />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
