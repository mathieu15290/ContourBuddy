---
name: Couches cartographiques (WMTS / WMS)
description: Liste des 15 calques disponibles + endpoints Géoplateforme IGN / MNHN / BRGM / INRAE (sans clé)
type: reference
---

Registre centralisé dans `src/lib/layers.ts` → `EXTERNAL_LAYER_CONFIGS`.
Factory Leaflet : `buildExternalLayer(cfg)` dans `src/components/ContourMap.tsx`.

## Endpoints
- WMTS IGN : `https://data.geopf.fr/wmts` (STYLE=normal obligatoire, sinon 400)
- WMS IGN  : `https://data.geopf.fr/wms-r` (version 1.3.0, transparent=true)
- WMS BRGM : `https://geoservices.brgm.fr/geologie`

## Couches
| Groupe | id | Couche | TileMatrixSet |
|--------|----|--------|---------------|
| base | plan | GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2 | PM |
| base | satellite | ORTHOIMAGERY.ORTHOPHOTOS (jpeg) | PM |
| base | cadastre | CADASTRALPARCELS.PARCELLAIRE_EXPRESS (style "PCI vecteur") | PM |
| base | lidar | IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW | PM_0_18 |
| env | hydro | HYDROGRAPHY.HYDROGRAPHY | PM_6_18 |
| env | natura2000 | Patrinat_SIC + Patrinat_ZPS (group) | PM_6_16 |
| env | znieff | Patrinat_ZNIEFF1 + Patrinat_ZNIEFF2 (group) | PM_6_16 |
| env | foret | WMS LANDCOVER.FORESTINVENTORY.V2 | — |
| env | sols | WMS INRA.CARTE.SOLS | — |
| env | geologie | WMS BRGM SCAN_F_GEOL50 | — |

## Pièges connus
- Les WMTS Patrinat_* n'existent que sur PM_6_16 (pas PM). minZoom extrait automatiquement du nom du matrixSet dans `buildExternalLayer`.
- STYLE=normal (empty ou "default" → 400 sur Patrinat).
- 404 tolérés pour tuiles hors emprise France (couches thématiques nationales).
