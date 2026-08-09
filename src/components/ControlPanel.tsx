import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  FileJson,
  FileText,
  Image,
  Globe,
  Loader2,
  Shapes,
  Box,
} from "lucide-react";
import type { ContourResult } from "@/lib/contours";
import logo from "@/assets/logo.png";
import { ClimateCard } from "@/components/ClimateCard";
import { Slider } from "@/components/ui/slider";
import type { Basemap3D } from "@/components/Terrain3D";

interface Props {
  interval: number;
  onIntervalChange: (v: number) => void;
  hasBounds: boolean;
  loading: boolean;
  progress: number;
  onGenerate: () => void;
  contours: ContourResult | null;
  minElev: number;
  maxElev: number;
  area: number;
  centroid: { lat: number; lon: number } | null;
  onExportGeoJSON: () => void;
  onExportDXF: () => void;
  onExportKML: () => void;
  onExportSVG: () => void;
  onExportPNG: () => void;
  has3D: boolean;
  onOpen3D: () => void;
  exaggeration: number;
  onExaggerationChange: (v: number) => void;
  basemap3d: Basemap3D;
  onBasemap3DChange: (v: Basemap3D) => void;
}

export function ControlPanel({
  interval,
  onIntervalChange,
  hasBounds,
  loading,
  progress,
  onGenerate,
  contours,
  minElev,
  maxElev,
  area,
  centroid,
  onExportGeoJSON,
  onExportDXF,
  onExportKML,
  onExportSVG,
  onExportPNG,
  has3D,
  onOpen3D,
  exaggeration,
  onExaggerationChange,
  basemap3d,
  onBasemap3DChange,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      {/* Generation controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <img src={logo} alt="Logo" className="h-5 w-5" />
            Paramètres
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Intervalle des courbes
            </label>
            <Select
              value={String(interval)}
              onValueChange={(v) => onIntervalChange(Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 mètre</SelectItem>
                <SelectItem value="5">5 mètres</SelectItem>
                <SelectItem value="10">10 mètres</SelectItem>
                <SelectItem value="25">25 mètres</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={onGenerate}
            disabled={!hasBounds || loading}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération...
              </>
            ) : (
            <>
              <img src={logo} alt="Logo" className="h-4 w-4" />
              Générer les courbes
            </>
            )}
          </Button>

          {loading && (
            <div className="space-y-1">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                Récupération des altitudes... {progress}%
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info panel */}
      {contours && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Résultats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-muted rounded-md p-2">
                <p className="text-muted-foreground text-xs">Alt. min</p>
                <p className="font-semibold text-foreground">{Math.round(minElev)}m</p>
              </div>
              <div className="bg-muted rounded-md p-2">
                <p className="text-muted-foreground text-xs">Alt. max</p>
                <p className="font-semibold text-foreground">{Math.round(maxElev)}m</p>
              </div>
              <div className="bg-muted rounded-md p-2">
                <p className="text-muted-foreground text-xs">Courbes</p>
                <p className="font-semibold text-foreground">{contours.lines.length}</p>
              </div>
              <div className="bg-muted rounded-md p-2">
                <p className="text-muted-foreground text-xs">Surface</p>
                <p className="font-semibold text-foreground">{area.toFixed(2)} km²</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Visualisation 3D */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Box className="h-4 w-4 text-primary" />
            Visualisation 3D
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-foreground">Exagération verticale</label>
              <span className="text-xs text-muted-foreground tabular-nums">×{exaggeration.toFixed(1)}</span>
            </div>
            <Slider
              value={[exaggeration]}
              min={1}
              max={5}
              step={0.1}
              onValueChange={(v) => onExaggerationChange(v[0])}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Fond 3D</label>
            <Select value={basemap3d} onValueChange={(v) => onBasemap3DChange(v as Basemap3D)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="satellite">Photo aérienne</SelectItem>
                <SelectItem value="plan">Plan IGN</SelectItem>
                <SelectItem value="none">Relief (teinte hypsométrique)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button variant="secondary" className="w-full" disabled={!has3D} onClick={onOpen3D}>
            <Box className="h-4 w-4" />
            Vue 3D du terrain
          </Button>
          {!has3D && (
            <p className="text-xs text-muted-foreground text-center">
              Générez d'abord les courbes pour activer la 3D.
            </p>
          )}
        </CardContent>
      </Card>

      {centroid && <ClimateCard lat={centroid.lat} lon={centroid.lon} />}



      {/* Export panel */}
      {contours && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" />
              Exporter
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={onExportGeoJSON}>
              <FileJson className="h-4 w-4" />
              GeoJSON
              <span className="ml-auto text-xs text-muted-foreground">QGIS, Mapbox</span>
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={onExportDXF}>
              <FileText className="h-4 w-4" />
              DXF
              <span className="ml-auto text-xs text-muted-foreground">AutoCAD</span>
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={onExportKML}>
              <Globe className="h-4 w-4" />
              KML
              <span className="ml-auto text-xs text-muted-foreground">Google Earth</span>
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={onExportSVG}>
              <Shapes className="h-4 w-4" />
              SVG
              <span className="ml-auto text-xs text-muted-foreground">Illustrator, Inkscape</span>
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={onExportPNG}>
              <Image className="h-4 w-4" />
              PNG
              <span className="ml-auto text-xs text-muted-foreground">Image</span>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
