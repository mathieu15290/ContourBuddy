import type { LayerId } from "@/lib/layers";
import { SLOPE_LEGEND, ASPECT_LEGEND } from "@/lib/terrain";

export type LegendEntry = { color: string; label: string; pattern?: "line" | "fill" };
export type LegendDef = {
  title: string;
  source?: string;
  entries: LegendEntry[];
  /** Lien vers la légende officielle (PNG ou page fournisseur). */
  footer?: { label: string; href: string };
};

// Note : pour les couches à typologie très riche (BD Forêt V2 ≈ 32 essences,
// géologie BRGM, sols GIS Sol), on affiche une légende « représentative » avec
// les grandes familles et un lien vers la légende officielle exhaustive.
// Les couleurs sont reprises des légendes officielles PNG des fournisseurs.

export const LAYER_LEGENDS: Partial<Record<LayerId, LegendDef>> = {
  slope: {
    title: "Classes de pente",
    source: "Calcul local (dérivée du MNT RGE ALTI)",
    entries: SLOPE_LEGEND.map((r) => ({ color: r.color, label: r.label, pattern: "fill" as const })),
  },
  aspect: {
    title: "Orientation (azimut)",
    source: "Calcul local (dérivée du MNT RGE ALTI)",
    entries: ASPECT_LEGEND.map((r) => ({ color: r.color, label: r.label, pattern: "fill" as const })),
  },

  lidar: {
    title: "LIDAR HD — ombrage MNT",
    source: "IGN — LIDAR HD",
    entries: [
      { color: "#111111", label: "Versants à l'ombre" },
      { color: "#7a7a7a", label: "Reliefs intermédiaires" },
      { color: "#ececec", label: "Versants éclairés (NW)" },
    ],
    footer: {
      label: "Documentation LIDAR HD (IGN)",
      href: "https://geoservices.ign.fr/lidarhd",
    },
  },

  hydro: {
    title: "Hydrographie (BD TOPO)",
    source: "IGN — BD TOPO®",
    entries: [
      { color: "#3a7fbf", label: "Cours d'eau permanent", pattern: "line" },
      { color: "#7fb3d5", label: "Cours d'eau intermittent", pattern: "line" },
      { color: "#a7d3ea", label: "Surface en eau (lac, étang)" },
      { color: "#c9e4f2", label: "Zone humide" },
    ],
    footer: {
      label: "Symbolisation BD TOPO® (IGN)",
      href: "https://geoservices.ign.fr/bdtopo",
    },
  },

  foret: {
    title: "BD Forêt® V2 — grandes formations",
    source: "IGN — Inventaire forestier",
    entries: [
      { color: "#1f6b2b", label: "Feuillus purs" },
      { color: "#4a9d5a", label: "Feuillus mélangés" },
      { color: "#0d4d2a", label: "Conifères purs" },
      { color: "#3e7d4d", label: "Conifères mélangés" },
      { color: "#7cae7a", label: "Mélange feuillus / conifères" },
      { color: "#c9b47a", label: "Peupleraie" },
      { color: "#d9c88e", label: "Formation ouverte / lande" },
      { color: "#e8e0b8", label: "Forêt fermée sans couvert" },
    ],
    footer: {
      label: "Nomenclature BD Forêt® V2 (32 postes)",
      href: "https://geoservices.ign.fr/bdforet",
    },
  },

  natura2000: {
    title: "Réseau Natura 2000",
    source: "MNHN — INPN Patrinat",
    entries: [
      { color: "#2f8a3e", label: "ZSC — Zone Spéciale de Conservation (Directive Habitats)" },
      { color: "#c14b2c", label: "ZPS — Zone de Protection Spéciale (Directive Oiseaux)" },
    ],
    footer: {
      label: "Légende officielle INPN",
      href: "https://inpn.mnhn.fr/programme/natura2000/presentation/objectifs",
    },
  },

  znieff: {
    title: "ZNIEFF — Inventaire du patrimoine naturel",
    source: "MNHN — INPN",
    entries: [
      { color: "#f2b134", label: "ZNIEFF de type 1 (secteurs à forte valeur biologique)" },
      { color: "#f7d894", label: "ZNIEFF de type 2 (grands ensembles naturels)" },
    ],
    footer: {
      label: "Méthodologie ZNIEFF (INPN)",
      href: "https://inpn.mnhn.fr/programme/inventaire-znieff/presentation",
    },
  },

  cadastre: {
    title: "Parcellaire cadastral",
    source: "IGN — Parcellaire Express (PCI)",
    entries: [
      { color: "#c62828", label: "Limite de parcelle", pattern: "line" },
      { color: "#7a1f1f", label: "Numéro de parcelle" },
      { color: "#8d6e63", label: "Bâti" },
    ],
    footer: {
      label: "Documentation PCI Express (IGN)",
      href: "https://geoservices.ign.fr/pci",
    },
  },

  sols: {
    title: "Carte des sols dominants",
    source: "INRAE — GIS Sol",
    entries: [
      { color: "#c8a26a", label: "Sols bruns (brunisols)" },
      { color: "#a67c52", label: "Sols lessivés (luvisols)" },
      { color: "#e6d3a3", label: "Sols calcaires (calcosols / calcisols)" },
      { color: "#7a5230", label: "Sols hydromorphes (rédoxisols)" },
      { color: "#4d3319", label: "Sols organiques (histosols)" },
      { color: "#d9b382", label: "Sols peu évolués (régosols)" },
    ],
    footer: {
      label: "Légende détaillée GIS Sol",
      href: "https://www.gissol.fr/donnees/cartes",
    },
  },

  geologie: {
    title: "Carte géologique 1/50 000",
    source: "BRGM — InfoTerre",
    entries: [
      { color: "#f4d35e", label: "Formations sédimentaires — sables & alluvions" },
      { color: "#c9a664", label: "Roches sédimentaires — calcaires" },
      { color: "#8b6a4a", label: "Roches sédimentaires — argiles & marnes" },
      { color: "#b0413e", label: "Roches magmatiques — granites" },
      { color: "#5a3a5a", label: "Roches volcaniques — basaltes" },
      { color: "#4a6b8a", label: "Roches métamorphiques — schistes / gneiss" },
    ],
    footer: {
      label: "Notice & légende InfoTerre (BRGM)",
      href: "https://infoterre.brgm.fr/page/cartes-geologiques",
    },
  },
};
