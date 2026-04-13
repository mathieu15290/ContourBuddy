

# Synchronisation profil ↔ carte : marqueur + tooltip

## Résumé
Au survol du profil altimétrique, un marqueur apparaît sur la carte à la position géographique correspondante, avec un tooltip affichant altitude et distance.

## Modifications

### 1. Enrichir `ProfilePoint` avec les coordonnées (`elevation.ts` + `ElevationProfile.tsx`)
- Ajouter `lat` et `lon` à l'interface `ProfilePoint`
- Modifier `fetchElevationAlongLine` pour retourner `{ distance, elevation, lat, lon }`

### 2. Callback de survol dans `ElevationProfile.tsx`
- Ajouter une prop `onHoverPoint?: (point: ProfilePoint | null) => void`
- Appeler `onHoverPoint(closest)` dans `handleMouseMove` et `onHoverPoint(null)` dans `onMouseLeave`

### 3. Marqueur sur la carte dans `ContourMap.tsx`
- Nouvelle prop `highlightPoint?: { lat: number; lon: number; elevation: number; distance: number } | null`
- Afficher un `L.circleMarker` + `L.tooltip` à cette position quand non null
- Supprimer le marqueur quand null

### 4. Câblage dans `Index.tsx`
- Nouvel état `hoveredProfilePoint`
- Passer `onHoverPoint` à `ElevationProfile` et `highlightPoint` à `ContourMap`

## Fichiers modifiés
- `src/lib/elevation.ts` — ajouter lat/lon au retour
- `src/components/ElevationProfile.tsx` — ajouter prop `onHoverPoint`
- `src/components/ContourMap.tsx` — ajouter prop `highlightPoint` + marqueur Leaflet
- `src/pages/Index.tsx` — état + câblage des props

