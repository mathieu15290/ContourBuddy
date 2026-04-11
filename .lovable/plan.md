

## Problem

The `leaflet-draw` library loaded from CDN (`1.0.4`) has a known bug where `L.drawLocal.draw.handlers.rectangle.tooltip` references an undefined `type` variable, causing the rectangle drawing tool to crash on mouse move.

## Fix

1. **Install leaflet-draw as an npm package** instead of CDN to get a compatible version, or pin a working version.
2. **Remove the CDN link** for `leaflet.draw.css` from `index.html` and import the CSS from the npm package.
3. **Add a polyfill/patch** for the `readableArea` function if needed — the error occurs in the tooltip text generation when computing area units.

Alternatively, the simplest fix: **switch from `leaflet-draw` to a custom rectangle drawing handler** using plain Leaflet mouse events (`mousedown`, `mousemove`, `mouseup` + `L.rectangle`). This removes the brittle dependency entirely and gives full control over the UX.

## Recommended approach: Replace leaflet-draw with custom rectangle selection

In `ContourMap.tsx`:
- Remove all `leaflet-draw` imports and draw control setup
- Implement a simple "Draw Rectangle" toggle button overlay
- On activation, listen to map `mousedown` → `mousemove` → `mouseup` to create an `L.rectangle`
- Call `onBoundsSelected` with the resulting bounds
- Style the button to match the existing UI

In `index.html`:
- Remove the `leaflet.draw.css` CDN link

This eliminates the dependency and the bug entirely.

