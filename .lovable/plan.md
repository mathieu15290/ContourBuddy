

# 🗺️ Générateur de Courbes de Niveaux

Application web permettant de générer des courbes de niveaux à partir d'une localisation, en utilisant les données d'élévation publiques de l'IGN.

## Page d'accueil — Recherche de localisation
- Barre de recherche avec **autocomplétion d'adresses** (API Adresse IGN)
- Carte interactive (Leaflet + fonds de carte IGN) pour sélectionner visuellement une zone
- L'utilisateur peut dessiner un rectangle pour définir la zone d'intérêt
- Choix de l'intervalle des courbes (1m, 5m, 10m, 25m)
- Bouton "Générer les courbes de niveaux"

## Visualisation des résultats
- Affichage des **courbes de niveaux sur la carte interactive** avec couleurs par altitude
- Les courbes maîtresses (tous les 5 ou 10 intervalles) sont plus épaisses
- Affichage des altitudes sur les courbes
- Possibilité de superposer avec la vue satellite ou cadastrale
- Panneau latéral avec les infos : altitude min/max, surface couverte

## Export des fichiers
- Export **GeoJSON** (utilisable dans QGIS, Mapbox, etc.)
- Export **DXF** (utilisable dans AutoCAD)
- Export **image PNG** de la carte avec les courbes
- Export **KML** (Google Earth)

## Fonctionnement technique (transparent pour l'utilisateur)
- Récupération des données d'élévation via l'API Géoplateforme IGN (MNT)
- Génération des courbes de niveaux côté navigateur avec des algorithmes de contour (marching squares)
- Aucune installation requise, tout fonctionne dans le navigateur

## Design
- Interface épurée et professionnelle, orientée cartographie
- Palette de couleurs inspirée des cartes topographiques (verts, bruns, bleus)
- Responsive pour usage sur tablette terrain

