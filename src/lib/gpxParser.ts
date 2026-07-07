/**
 * GPX Parser Utility
 * Parses standard nautical GPX files to extract waypoints and routes
 */

export interface GPXWaypoint {
  lat: number;
  lng: number;
  name: string;
  symbol?: string;
  desc?: string;
  time?: string;
}

export interface GPXRoute {
  name: string;
  waypoints: GPXWaypoint[];
  distance?: number; // in nautical miles
}

export interface ParsedGPX {
  routes: GPXRoute[];
  waypoints: GPXWaypoint[];
  tracks?: any[];
}

/**
 * Parse GPX XML content and extract routes and waypoints
 * @param gpxContent - Raw GPX XML string
 * @returns Parsed GPX data
 */
export function parseGPX(gpxContent: string): ParsedGPX {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxContent, 'text/xml');

    // Check for parse errors
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('Invalid GPX file format');
    }

    const routes: GPXRoute[] = [];
    const waypoints: GPXWaypoint[] = [];

    // Parse routes (rte elements)
    const rteElements = xmlDoc.getElementsByTagName('rte');
    for (let i = 0; i < rteElements.length; i++) {
      const rte = rteElements[i];
      const routeName = rte.querySelector('name')?.textContent || `Ruta ${i + 1}`;
      
      const rtepts: GPXWaypoint[] = [];
      const rteptElements = rte.getElementsByTagName('rtept');
      
      for (let j = 0; j < rteptElements.length; j++) {
        const rtept = rteptElements[j];
        const lat = parseFloat(rtept.getAttribute('lat') || '0');
        const lng = parseFloat(rtept.getAttribute('lon') || '0');
        const name = rtept.querySelector('name')?.textContent || `Wp${j + 1}`;
        const desc = rtept.querySelector('desc')?.textContent || '';
        
        rtepts.push({
          lat,
          lng,
          name,
          desc: desc || undefined
        });
      }

      if (rtepts.length > 0) {
        routes.push({
          name: routeName,
          waypoints: rtepts,
          distance: calculateGPXDistance(rtepts)
        });
      }
    }

    // Parse standalone waypoints (wpt elements)
    const wptElements = xmlDoc.getElementsByTagName('wpt');
    for (let i = 0; i < wptElements.length; i++) {
      const wpt = wptElements[i];
      const lat = parseFloat(wpt.getAttribute('lat') || '0');
      const lng = parseFloat(wpt.getAttribute('lon') || '0');
      const name = wpt.querySelector('name')?.textContent || `WP${i + 1}`;
      const symbol = wpt.querySelector('sym')?.textContent || '';
      const desc = wpt.querySelector('desc')?.textContent || '';

      waypoints.push({
        lat,
        lng,
        name,
        symbol: symbol || undefined,
        desc: desc || undefined
      });
    }

    // Parse tracks (trk elements) as routes
    const trkElements = xmlDoc.getElementsByTagName('trk');
    for (let i = 0; i < trkElements.length; i++) {
      const trk = trkElements[i];
      const trackName = trk.querySelector('name')?.textContent || `Pista ${i + 1}`;
      
      const trkpts: GPXWaypoint[] = [];
      const trksegElements = trk.getElementsByTagName('trkseg');
      
      for (let k = 0; k < trksegElements.length; k++) {
        const trkseg = trksegElements[k];
        const trkptElements = trkseg.getElementsByTagName('trkpt');
        
        for (let j = 0; j < trkptElements.length; j++) {
          const trkpt = trkptElements[j];
          const lat = parseFloat(trkpt.getAttribute('lat') || '0');
          const lng = parseFloat(trkpt.getAttribute('lon') || '0');
          const time = trkpt.querySelector('time')?.textContent || '';
          const name = `TP${j + 1}`;
          
          trkpts.push({
            lat,
            lng,
            name,
            time: time || undefined
          });
        }
      }

      if (trkpts.length > 0) {
        routes.push({
          name: trackName,
          waypoints: trkpts,
          distance: calculateGPXDistance(trkpts)
        });
      }
    }

    return {
      routes,
      waypoints,
      tracks: []
    };
  } catch (error) {
    console.error('Error parsing GPX:', error);
    throw error;
  }
}

/**
 * Calculate distance in nautical miles between waypoints
 * Uses Haversine formula
 */
function calculateGPXDistance(waypoints: GPXWaypoint[]): number {
  let totalDistance = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const lat1 = waypoints[i].lat;
    const lon1 = waypoints[i].lng;
    const lat2 = waypoints[i + 1].lat;
    const lon2 = waypoints[i + 1].lng;

    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    totalDistance += distance * 0.539957; // Convert to nautical miles
  }

  return totalDistance;
}

/**
 * Export route to GPX format
 */
export function exportRouteToGPX(routeName: string, waypoints: GPXWaypoint[]): string {
  const now = new Date().toISOString();
  
  let gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="VELARIS">
  <metadata>
    <name>${escapeXML(routeName)}</name>
    <time>${now}</time>
  </metadata>
  <rte>
    <name>${escapeXML(routeName)}</name>`;

  waypoints.forEach((wp, idx) => {
    gpxContent += `
    <rtept lat="${wp.lat}" lon="${wp.lng}">
      <name>${escapeXML(wp.name || `Waypoint ${idx + 1}`)}</name>
      ${wp.desc ? `<desc>${escapeXML(wp.desc)}</desc>` : ''}
    </rtept>`;
  });

  gpxContent += `
  </rte>
</gpx>`;

  return gpxContent;
}

/**
 * Helper to escape XML special characters
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
