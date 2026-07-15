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
    source: "MNHN — Patrinat (diffusé via IGN Géoplateforme)",
    entries: [
      { color: "#2f8a3e", label: "ZSC — Zone Spéciale de Conservation (Directive Habitats, art. 3)" },
      { color: "#8fc79a", label: "SIC — Site d'Importance Communautaire (validé par la Commission)" },
      { color: "#c7e3c9", label: "pSIC — Proposition de Site d'Importance Communautaire" },
      { color: "#c14b2c", label: "ZPS — Zone de Protection Spéciale (Directive Oiseaux, 2009/147/CE)" },
      { color: "#4a6b8a", label: "Site marin — habitats & espèces marines (annexes I & II)" },
      { color: "#8fb3d1", label: "Site marin — oiseaux (annexe I Directive Oiseaux)" },
      { color: "#5b3a2e", label: "Limite officielle du site (DOCOB)", pattern: "line" },
    ],
  },

  znieff: {
    title: "ZNIEFF (types 1 & 2)",
    source: "INPN / MNHN — Patrinat",
    entries: [
      { color: "#5aae4a", label: "ZNIEFF Type 1 (terrestre)" },
      { color: "#1f5a2a", label: "ZNIEFF Type 2 (terrestre)" },
    ],
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
    title: "Grandes classes de sols (Référentiel Pédologique français)",
    source: "INRAE — GIS Sol",
    entries: [
      // Sols à profil A/C — peu évolués
      { color: "#d9d9d9", label: "Lithosols / Rankosols — sols très minces sur roche dure" },
      { color: "#d9b382", label: "Régosols — sols peu évolués sur roche meuble" },
      { color: "#c9c088", label: "Fluviosols — sols alluviaux récents (vallées)" },
      { color: "#b8a97a", label: "Colluviosols — sols de bas de pente / colluvions" },
      { color: "#a89968", label: "Arénosols — sols sableux (podzoliques ou non)" },
      // Sols bruns et lessivés — climax tempéré
      { color: "#c8a26a", label: "Brunisols — sols bruns, altération in situ (forêts tempérées)" },
      { color: "#a67c52", label: "Luvisols — sols lessivés (argile migrée en profondeur)" },
      { color: "#8b5e3c", label: "Néoluvisols — luvisols peu différenciés (loess)" },
      // Sols carbonatés
      { color: "#e6d3a3", label: "Rendosols — sols calcaires superficiels sur roche dure" },
      { color: "#d4b98a", label: "Calcosols — sols bruns calcaires profonds" },
      { color: "#c5a878", label: "Calcisols — sols décarbonatés en surface" },
      // Sols hydromorphes
      { color: "#8fa87d", label: "Rédoxisols — engorgement temporaire (taches ocre/gris)" },
      { color: "#5f7a5a", label: "Réductisols — engorgement permanent (gley bleu-vert)" },
      { color: "#7a5230", label: "Pélosols — sols argileux gonflants, hydromorphes" },
      // Sols acides / podzoliques
      { color: "#6b4a2b", label: "Alocrisols — sols bruns acides (Al échangeable)" },
      { color: "#3d2a1a", label: "Podzosols — podzols, horizon cendreux + accumulation Fe/Al" },
      // Sols organiques et anthropiques
      { color: "#4d3319", label: "Histosols — sols organiques (tourbières)" },
      { color: "#b0413e", label: "Fersialsols — sols rouges méditerranéens riches en fer" },
      { color: "#8a6d3b", label: "Vertisols — argiles gonflantes à fentes de retrait" },
      { color: "#9e9e9e", label: "Anthroposols — sols fortement remaniés (urbains, miniers)" },
    ],
  },

  geologie: {
    title: "Carte géologique BRGM — 1/1 000 000 à 1/50 000",
    source: "BRGM — InfoTerre",
    entries: [
      // Quaternaire & Néogène
      { color: "#f5e6a3", label: "Holocène — alluvions récentes, tourbes" },
      { color: "#e6d28a", label: "Pléistocène — alluvions anciennes, loess, moraines" },
      { color: "#d4c078", label: "Pliocène — sables, argiles, conglomérats" },
      { color: "#b8c47a", label: "Miocène — molasses, calcaires lacustres" },
      // Paléogène
      { color: "#c4d9a8", label: "Oligocène — calcaires, marnes, sables" },
      { color: "#a8d18a", label: "Éocène — calcaires grossiers, gypses, lignites" },
      { color: "#8fc06a", label: "Paléocène — marnes & calcaires" },
      // Crétacé
      { color: "#7ab8c9", label: "Crétacé supérieur — craie, calcaires" },
      { color: "#5a9db5", label: "Crétacé inférieur — marnes, grès, calcaires urgoniens" },
      // Jurassique
      { color: "#9a8fc7", label: "Jurassique supérieur (Malm) — calcaires récifaux" },
      { color: "#7f73b5", label: "Jurassique moyen (Dogger) — calcaires oolithiques" },
      { color: "#6557a3", label: "Jurassique inférieur (Lias) — marnes & calcaires" },
      // Mésozoïque ancien
      { color: "#c97a7a", label: "Trias — grès bigarrés, marnes irisées, calcaires" },
      { color: "#b85c5c", label: "Permien — grès rouges, pélites, rhyolites" },
      { color: "#a88a8a", label: "Carbonifère — schistes houillers, calcaires, grès" },
      // Paléozoïque
      { color: "#8a9a8a", label: "Dévonien — schistes, calcaires, grès" },
      { color: "#7a8a8a", label: "Silurien — schistes ardoisiers, quartzites" },
      { color: "#6a7a7a", label: "Ordovicien — grès armoricains, schistes" },
      { color: "#5a6a6a", label: "Cambrien — schistes, grès, calcaires" },
      // Précambrien
      { color: "#c98a9a", label: "Protérozoïque — schistes & quartzites anciens" },
      { color: "#b56a7a", label: "Archéen — gneiss & migmatites anciens" },
      // Magmatiques plutoniques
      { color: "#d98a9a", label: "Granites & granitoïdes" },
      { color: "#c97a8a", label: "Granodiorites, diorites, monzonites" },
      { color: "#e0a0a0", label: "Rhyolites & volcanites acides" },
      { color: "#c48a6a", label: "Andésites & volcanites intermédiaires" },
      { color: "#6a6a6a", label: "Basaltes & volcanites basiques" },
      { color: "#5a6a5a", label: "Gabbros & dolérites" },
      { color: "#4a5a4a", label: "Roches ultrabasiques (péridotites, serpentinites)" },
      // Filons
      { color: "#9a9a9a", label: "Filons (quartz, pegmatites, lamprophyres)" },
      // Métamorphiques
      { color: "#8a9a8a", label: "Schistes & micaschistes" },
      { color: "#b0a0a0", label: "Gneiss & migmatites" },
      { color: "#5a7a5a", label: "Amphibolites & éclogites" },
      { color: "#d9d9d9", label: "Marbres & cipolins" },
      { color: "#c9c9c9", label: "Quartzites" },
    ],
    footer: {
      label: "Légende officielle BRGM (lithologie)",
      href: "https://infoterre.brgm.fr/page/cartes-geologiques",
    },
  },
};
