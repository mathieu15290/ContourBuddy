

# Profil d'élévation — Plan d'implémentation

## Fonctionnalité
L'utilisateur dessine une ligne (polyline) sur la carte. L'application récupère les altitudes le long de cette ligne via l'API IGN et affiche un graphique de profil altimétrique (distance horizontale vs altitude).

## Modifications

### 1. Nouveau composant `ElevationProfile.tsx`
- Graphique SVG responsive affichant le profil (axe X = distance cumulée en m/km, axe Y = altitude en m)
- Affichage des valeurs min/max/dénivelé
- Panneau rétractable en bas de la carte, avec bouton de fermeture
- Tooltip au survol montrant altitude et distance

### 2. Nouvelle fonction `fetchElevationAlongLine` dans `elevation.ts`
- Prend un tableau de `[lat, lng]` (points de la polyline)
- Interpole N points régulièrement espacés le long de la ligne (ex: 100-200 points)
- Appelle l'API IGN existante par batch pour récupérer les altitudes
- Retourne un tableau `{ distance: number, elevation: number }[]`

### 3. Modification de `ContourMap.tsx`
- Ajouter un deuxième bouton de contrôle "Dessiner un profil" (icône ligne/📈)
- Mode dessin polyline : click pour ajouter des points, double-click pour terminer
- Afficher la polyline sur la carte
- Passer les points dessinés au parent via un nouveau callback `onProfileLineDrawn`

### 4. Modification de `Index.tsx`
- Nouvel état pour les données du profil et la ligne dessinée
- Appel à `fetchElevationAlongLine` quand une ligne est dessinée
- Affichage du composant `ElevationProfile` en overlay en bas de la carte

## Flux utilisateur
1. Clic sur le bouton "Profil" dans les contrôles carte
2. Clic sur la carte pour poser des points de la ligne
3. Double-clic pour terminer le tracé
4. Chargement des altitudes (indicateur de progression)
5. Affichage du profil en bas de l'écran
6. Bouton pour fermer/supprimer le profil

