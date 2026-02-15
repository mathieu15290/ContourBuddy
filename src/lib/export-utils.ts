/**
 * Export utilities for contour data
 */

import { saveAs } from "file-saver";
import type { ContourResult } from "./contours";

/**
 * Export as GeoJSON
 */
export function exportGeoJSON(contours: ContourResult, filename: string = "courbes-niveaux") {
  const blob = new Blob([JSON.stringify(contours.geojson, null, 2)], {
    type: "application/geo+json",
  });
  saveAs(blob, `${filename}.geojson`);
}

/**
 * Export as KML
 */
export function exportKML(contours: ContourResult, filename: string = "courbes-niveaux") {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Courbes de niveaux</name>
  <description>Generated contour lines</description>`;

  for (const line of contours.lines) {
    const coords = line.coordinates
      .map(([lon, lat]) => `${lon},${lat},${line.elevation}`)
      .join(" ");

    kml += `
  <Placemark>
    <name>Altitude ${line.elevation}m</name>
    <description>${line.isMajor ? "Courbe maîtresse" : "Courbe normale"} - ${line.elevation}m</description>
    <Style>
      <LineStyle>
        <color>ff0000ff</color>
        <width>${line.isMajor ? 3 : 1}</width>
      </LineStyle>
    </Style>
    <LineString>
      <altitudeMode>absolute</altitudeMode>
      <coordinates>${coords}</coordinates>
    </LineString>
  </Placemark>`;
  }

  kml += `
</Document>
</kml>`;

  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  saveAs(blob, `${filename}.kml`);
}

/**
 * Export as DXF (simplified)
 */
export function exportDXF(contours: ContourResult, filename: string = "courbes-niveaux") {
  let dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n`;
  dxf += `0\nSECTION\n2\nTABLES\n0\nENDSEC\n`;
  dxf += `0\nSECTION\n2\nENTITIES\n`;

  for (const line of contours.lines) {
    if (line.coordinates.length < 2) continue;

    dxf += `0\nPOLYLINE\n8\n${line.isMajor ? "MAJOR" : "MINOR"}_${line.elevation}\n66\n1\n70\n0\n`;
    dxf += `30\n${line.elevation}\n`;

    for (const [lon, lat] of line.coordinates) {
      dxf += `0\nVERTEX\n8\n${line.isMajor ? "MAJOR" : "MINOR"}_${line.elevation}\n`;
      dxf += `10\n${lon}\n20\n${lat}\n30\n${line.elevation}\n`;
    }

    dxf += `0\nSEQEND\n`;
  }

  dxf += `0\nENDSEC\n0\nEOF\n`;

  const blob = new Blob([dxf], { type: "application/dxf" });
  saveAs(blob, `${filename}.dxf`);
}

/**
 * Export map as PNG using html-to-image
 */
export async function exportPNG(
  mapContainerEl: HTMLElement,
  filename: string = "courbes-niveaux"
) {
  const { toPng } = await import("html-to-image");
  const dataUrl = await toPng(mapContainerEl, { quality: 0.95 });
  saveAs(dataUrl, `${filename}.png`);
}
