// =============================================================================
// Layer registry — sources & endpoints (vérifiés via GetCapabilities, juil. 2026)
// =============================================================================
// Fonds de carte / Analyses terrain (IGN Géoplateforme WMTS, sans clé) :
//   https://data.geopf.fr/wmts?SERVICE=WMTS
//     • GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2       — Plan IGN
//     • ORTHOIMAGERY.ORTHOPHOTOS                — Photo aérienne
//     • CADASTRALPARCELS.PARCELLAIRE_EXPRESS    — Cadastre
//     • IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW — LIDAR HD (ombrage)
//     • HYDROGRAPHY.HYDROGRAPHY                 — Hydrographie BD TOPO
//     • Patrinat_SIC / Patrinat_ZPS             — Natura 2000 (MNHN)
//     • Patrinat_ZNIEFF1 / Patrinat_ZNIEFF2     — ZNIEFF 1 & 2 (MNHN)
// Environnement (WMS Géoplateforme) :
//   https://data.geopf.fr/wms-r?SERVICE=WMS
//     • LANDCOVER.FORESTINVENTORY.V2            — BD Forêt V2
//     • INRA.CARTE.SOLS                         — Carte des sols (INRAE)
// Géologie (WMS BRGM, sans clé) :
//   https://geoservices.brgm.fr/geologie?SERVICE=WMS
//     • SCAN_F_GEOL50                           — Carte géologique 1/50 000
// =============================================================================

export type LayerId =
  | "plan"
  | "satellite"
  | "cadastre"
  | "lidar"
  | "contours"
  | "labels"
  | "track"
  | "slope"
  | "aspect"
  | "foret"
  | "natura2000"
  | "znieff"
  | "hydro"
  | "sols"
  | "geologie";

export type LayerGroup = "base" | "terrain" | "environment";

export interface LayerSource {
  provider: "IGN" | "MNHN" | "BRGM" | "INRAE";
  label: string;
  url: string;
}

export interface LayerState {
  id: LayerId;
  label: string;
  visible: boolean;
  opacity: number; // 0..1
  group: LayerGroup;
  /** Labels n'a pas d'opacité, juste visibilité. */
  noOpacity?: boolean;
  /** Métadonnées (source, lien) pour la popover d'info. */
  source?: LayerSource;
}

// -----------------------------------------------------------------------------
// Configurations des couches externes (tuiles) créées côté carte.
// -----------------------------------------------------------------------------
export type ExternalLayerConfig =
  | {
      kind: "wmts";
      url: string;
      layer: string;
      style?: string;
      format?: string;
      matrixSet?: string;
      maxZoom?: number;
      attribution?: string;
    }
  | {
      kind: "wms";
      url: string;
      layers: string;
      format?: string;
      version?: string;
      transparent?: boolean;
      attribution?: string;
      maxZoom?: number;
    }
  | {
      kind: "group";
      children: ExternalLayerConfig[];
    };

const GEOPF_WMTS = "https://data.geopf.fr/wmts";
const GEOPF_WMS = "https://data.geopf.fr/wms-r";
const BRGM_WMS = "https://geoservices.brgm.fr/geologie";

const wmts = (layer: string, opts: Partial<Extract<ExternalLayerConfig, { kind: "wmts" }>> = {}): ExternalLayerConfig => ({
  kind: "wmts",
  url: GEOPF_WMTS,
  layer,
  style: "normal",
  format: "image/png",
  matrixSet: "PM",
  maxZoom: 19,
  attribution: "© IGN",
  ...opts,
});

export const EXTERNAL_LAYER_CONFIGS: Partial<Record<LayerId, ExternalLayerConfig>> = {
  plan: wmts("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2"),
  satellite: wmts("ORTHOIMAGERY.ORTHOPHOTOS", { format: "image/jpeg" }),
  cadastre: wmts("CADASTRALPARCELS.PARCELLAIRE_EXPRESS", { style: "PCI vecteur" }),
  lidar: wmts("IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW", { format: "image/jpeg" }),
  hydro: wmts("HYDROGRAPHY.HYDROGRAPHY"),
  natura2000: {
    kind: "group",
    children: [wmts("Patrinat_SIC"), wmts("Patrinat_ZPS")],
  },
  znieff: {
    kind: "group",
    children: [wmts("Patrinat_ZNIEFF1"), wmts("Patrinat_ZNIEFF2")],
  },
  foret: {
    kind: "wms",
    url: GEOPF_WMS,
    layers: "LANDCOVER.FORESTINVENTORY.V2",
    format: "image/png",
    version: "1.3.0",
    transparent: true,
    attribution: "© IGN — BD Forêt V2",
    maxZoom: 19,
  },
  sols: {
    kind: "wms",
    url: GEOPF_WMS,
    layers: "INRA.CARTE.SOLS",
    format: "image/png",
    version: "1.3.0",
    transparent: true,
    attribution: "© INRAE — GIS Sol",
    maxZoom: 15,
  },
  geologie: {
    kind: "wms",
    url: BRGM_WMS,
    layers: "SCAN_F_GEOL50",
    format: "image/png",
    version: "1.3.0",
    transparent: true,
    attribution: "© BRGM",
    maxZoom: 19,
  },
};

// -----------------------------------------------------------------------------
// État par défaut affiché dans le LayersPanel.
// -----------------------------------------------------------------------------
export const DEFAULT_LAYERS: LayerState[] = [
  // — Fonds de carte —
  { id: "plan",      label: "Plan IGN",              visible: true,  opacity: 1, group: "base",
    source: { provider: "IGN", label: "IGN Géoplateforme", url: "https://geoservices.ign.fr/" } },
  { id: "satellite", label: "Photo aérienne",        visible: false, opacity: 1, group: "base",
    source: { provider: "IGN", label: "BD ORTHO®", url: "https://geoservices.ign.fr/bdortho" } },
  { id: "cadastre",  label: "Cadastre",              visible: false, opacity: 0.7, group: "base",
    source: { provider: "IGN", label: "Parcellaire Express", url: "https://geoservices.ign.fr/pci" } },
  { id: "lidar",     label: "LIDAR HD (ombrage MNT)", visible: false, opacity: 0.7, group: "base",
    source: { provider: "IGN", label: "LIDAR HD", url: "https://geoservices.ign.fr/lidarhd" } },

  // — Analyses terrain —
  { id: "contours",  label: "Courbes de niveaux",    visible: true,  opacity: 1, group: "terrain" },
  { id: "labels",    label: "Étiquettes d'altitude", visible: true,  opacity: 1, group: "terrain", noOpacity: true },
  { id: "slope",     label: "Pentes (permaculture)", visible: false, opacity: 0.6, group: "terrain" },
  { id: "aspect",    label: "Exposition (azimut)",   visible: false, opacity: 0.6, group: "terrain" },
  { id: "track",     label: "Trace importée",        visible: true,  opacity: 0.9, group: "terrain" },

  // — Environnement —
  { id: "foret",      label: "Forêts (BD Forêt V2)",         visible: false, opacity: 0.7, group: "environment",
    source: { provider: "IGN", label: "BD Forêt® V2", url: "https://geoservices.ign.fr/bdforet" } },
  { id: "natura2000", label: "Natura 2000 (ZSC + ZPS)",      visible: false, opacity: 0.7, group: "environment",
    source: { provider: "MNHN", label: "INPN — Patrinat", url: "https://inpn.mnhn.fr/programme/natura2000" } },
  { id: "znieff",     label: "ZNIEFF 1 & 2",                 visible: false, opacity: 0.7, group: "environment",
    source: { provider: "MNHN", label: "INPN — ZNIEFF", url: "https://inpn.mnhn.fr/programme/inventaire-znieff" } },
  { id: "hydro",      label: "Hydrographie (BD TOPO)",       visible: false, opacity: 0.7, group: "environment",
    source: { provider: "IGN", label: "BD TOPO®", url: "https://geoservices.ign.fr/bdtopo" } },
  { id: "sols",       label: "Carte des sols (GIS Sol)",     visible: false, opacity: 0.7, group: "environment",
    source: { provider: "INRAE", label: "GIS Sol", url: "https://www.gissol.fr/" } },
  { id: "geologie",   label: "Géologie (BRGM 1/50 000)",     visible: false, opacity: 0.7, group: "environment",
    source: { provider: "BRGM", label: "InfoTerre BRGM", url: "https://infoterre.brgm.fr/" } },
];

export const LAYER_GROUP_LABELS: Record<LayerGroup, string> = {
  base: "Fonds de carte",
  terrain: "Analyses terrain",
  environment: "Environnement",
};
