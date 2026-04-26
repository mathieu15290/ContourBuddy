export type LayerId = "plan" | "satellite" | "cadastre" | "contours" | "labels" | "track";

export interface LayerState {
  id: LayerId;
  label: string;
  visible: boolean;
  opacity: number; // 0..1
  /** Labels n'a pas d'opacité, juste visibilité. */
  noOpacity?: boolean;
}

export const DEFAULT_LAYERS: LayerState[] = [
  { id: "track",     label: "Trace importée",      visible: true, opacity: 0.9 },
  { id: "labels",    label: "Étiquettes d'altitude", visible: true, opacity: 1, noOpacity: true },
  { id: "contours",  label: "Courbes de niveaux",  visible: true, opacity: 1 },
  { id: "cadastre",  label: "Cadastre",            visible: false, opacity: 0.7 },
  { id: "satellite", label: "Photo aérienne",      visible: false, opacity: 1 },
  { id: "plan",      label: "Plan IGN",            visible: true, opacity: 1 },
];
