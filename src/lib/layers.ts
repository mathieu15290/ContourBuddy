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

export type LayerSection =
  | "fonds"
  | "topo"
  | "environnement"
  | "eau"
  | "bati"
  | "sol"
  | "climat";

export interface LayerState {
  id: LayerId;
  label: string;
  section: LayerSection;
  visible: boolean;
  opacity: number; // 0..1
  /** Masque le slider (ex : étiquettes d'altitude). */
  noOpacity?: boolean;
  /** Service externe indisponible → message affiché à la place du toggle. */
  unavailable?: string;
}

export const SECTION_META: Record<LayerSection, { label: string; emoji: string }> = {
  fonds:         { label: "Fonds de plan",     emoji: "🗺️" },
  topo:          { label: "Topographie",       emoji: "⛰️" },
  environnement: { label: "Environnement",     emoji: "🌿" },
  eau:           { label: "Eau",               emoji: "💧" },
  bati:          { label: "Bâti & cadastre",   emoji: "🏠" },
  sol:           { label: "Sol",               emoji: "🌱" },
  climat:        { label: "Climat",            emoji: "🌦️" },
};

/** Ordre d'affichage des sections dans le panneau. */
export const SECTION_ORDER: LayerSection[] = [
  "topo",
  "environnement",
  "eau",
  "bati",
  "sol",
  "climat",
  "fonds",
];

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
      styles?: string;
      format?: string;
      version?: string;
      transparent?: boolean;
      attribution?: string;
      maxNativeZoom?: number;
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
  lidar: wmts("IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW", { matrixSet: "PM_0_18", maxZoom: 18 }),
  hydro: wmts("HYDROGRAPHY.HYDROGRAPHY", { matrixSet: "PM_6_18", maxZoom: 18 }),
  natura2000: {
    kind: "group",
    children: [
      wmts("Patrinat_SIC", { matrixSet: "PM_6_16", maxZoom: 16 }),
      wmts("Patrinat_ZPS", { matrixSet: "PM_6_16", maxZoom: 16 }),
    ],
  },
  znieff: {
    kind: "group",
    children: [
      wmts("Patrinat_ZNIEFF1", { matrixSet: "PM_6_16", maxZoom: 16 }),
      wmts("Patrinat_ZNIEFF2", { matrixSet: "PM_6_16", maxZoom: 16 }),
    ],
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
    styles: "CARTE DES SOLS",
    format: "image/png",
    version: "1.3.0",
    transparent: true,
    attribution: "© INRAE — GIS Sol",
    // Le service WMS sols ne rend plus de données en dessous d'environ 1:8 500.
    // On demande donc la dernière échelle native fiable, puis Leaflet la surzoome.
    maxNativeZoom: 15,
    maxZoom: 22,
  },
  geologie: {
    kind: "wms",
    url: BRGM_WMS,
    layers: "GEOLOGIE",
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
  // — Topographie —
  { id: "contours", label: "Courbes de niveaux",     section: "topo", visible: true,  opacity: 1 },
  { id: "labels",   label: "Étiquettes d'altitude",  section: "topo", visible: true,  opacity: 1, noOpacity: true },
  { id: "slope",    label: "Pentes (permaculture)",  section: "topo", visible: false, opacity: 0.6 },
  { id: "aspect",   label: "Exposition (azimut)",    section: "topo", visible: false, opacity: 0.6 },
  { id: "lidar",    label: "LIDAR HD (ombrage MNT)", section: "topo", visible: false, opacity: 0.7 },
  { id: "track",    label: "Trace importée",         section: "topo", visible: true,  opacity: 0.9 },

  // — Environnement —
  { id: "foret",      label: "Forêts (BD Forêt V2)",    section: "environnement", visible: false, opacity: 0.7 },
  { id: "natura2000", label: "Natura 2000 (ZSC + ZPS)", section: "environnement", visible: false, opacity: 0.7 },
  { id: "znieff",     label: "ZNIEFF 1 & 2",            section: "environnement", visible: false, opacity: 0.7 },

  // — Eau —
  { id: "hydro", label: "Hydrographie (BD TOPO)", section: "eau", visible: false, opacity: 0.7 },

  // — Bâti & cadastre —
  { id: "cadastre", label: "Cadastre", section: "bati", visible: false, opacity: 0.7 },

  // — Sol —
  { id: "sols",     label: "Carte des sols (GIS Sol)",   section: "sol", visible: false, opacity: 0.7 },
  { id: "geologie", label: "Géologie (BRGM 1/50 000)",   section: "sol", visible: false, opacity: 0.7 },

  // — Fonds de plan (tout en bas de pile) —
  { id: "plan",      label: "Plan IGN",       section: "fonds", visible: true,  opacity: 1 },
  { id: "satellite", label: "Photo aérienne", section: "fonds", visible: false, opacity: 1 },
];
