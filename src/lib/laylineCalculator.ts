/**
 * Layline Calculator Utility
 * Calculates optimal sailing angle to waypoint and detects deviation
 */

import { calculateTwa } from './useWeather';

export interface LaylineData {
  optimalBearing: number;        // True bearing to waypoint (0-359°)
  currentCOG: number;             // Current course over ground
  deviation: number;              // Deviation in degrees (-180 to 180)
  isDeviated: boolean;            // True if deviation exceeds threshold
  deviationPercentage: number;    // Deviation as percentage of acceptable range
  windOptimalAngle: number;       // Optimal sailing angle relative to wind
  apparentWind: number;           // Current apparent wind angle
  isOffLayline: boolean;          // True if significantly off layline
}

export interface AnchorWatchData {
  isAnchored: boolean;
  anchorLat?: number;
  anchorLng?: number;
  currentLat: number;
  currentLng: number;
  driftDistance: number;          // in meters
  driftBearing: number;           // Direction of drift (0-359°)
  isDrifting: boolean;            // True if drift exceeds threshold
  driftThreshold: number;          // Alarm threshold in meters
}

/**
 * Calculate dynamic deviation threshold based on point of sail (TWA)
 * 
 * Precision requirements vary by sailing configuration:
 * - Close-hauled (ceñida): Requires tight precision (8°)
 * - Close reach: Moderate precision (10°)
 * - Beam reach & broad reach (través): Standard precision (15°)
 * - Running (empopada): Relaxed precision (18°)
 * 
 * @param twa - True Wind Angle (0-359°)
 * @returns Dynamic deviation threshold in degrees
 */
export function calculateDynamicDeviationThreshold(twa: number): number {
  // Normalize TWA to 0-360 range
  const normalizedTWA = ((twa % 360) + 360) % 360;

  // Close-hauled (ceñida): 0-30° or 330-360° — máxima precisión
  if (normalizedTWA < 30 || normalizedTWA >= 330) {
    return 8;
  }
  
  // Close reach: 30-60° or 300-330° — precisión moderada
  if ((normalizedTWA >= 30 && normalizedTWA < 60) || 
      (normalizedTWA >= 300 && normalizedTWA < 330)) {
    return 10;
  }
  
  // Beam reach & broad reach (través): 60-120° or 240-300° — precisión estándar
  if ((normalizedTWA >= 60 && normalizedTWA < 120) || 
      (normalizedTWA >= 240 && normalizedTWA < 300)) {
    return 15;
  }
  
  // Running (empopada): 120-240° — precisión relajada
  return 18;
}

/**
 * Calculate layline deviation
 * Optimal angle to waypoint vs current course
 * Uses dynamic deviation threshold based on current point of sail (TWA)
 * 
 * @param currentLat - Current latitude
 * @param currentLng - Current longitude
 * @param waypointLat - Destination latitude
 * @param waypointLng - Destination longitude
 * @param currentCOG - Current course over ground (0-359°)
 * @param windDir - Wind direction (0-359°)
 * @param sog - Speed over ground in knots
 * @param deviationThreshold - Alarm threshold in degrees (deprecated: now calculated dynamically)
 * @returns LaylineData object with dynamic precision requirements
 */
export function calculateLaylineDeviation(
  currentLat: number,
  currentLng: number,
  waypointLat: number,
  waypointLng: number,
  currentCOG: number,
  windDir: number,
  sog: number,
  deviationThreshold: number = 15  // Fallback for backwards compatibility
): LaylineData {
  // Calculate true bearing to waypoint
  const optimalBearing = calculateBearing(
    currentLat,
    currentLng,
    waypointLat,
    waypointLng
  );

  // Calculate deviation (shortest angle difference)
  let deviation = optimalBearing - currentCOG;
  
  // Normalize to -180 to 180 range
  if (deviation > 180) {
    deviation -= 360;
  } else if (deviation < -180) {
    deviation += 360;
  }

  // Calculate optimal sailing angle relative to wind (for sailboats)
  // Optimal is typically 22-35° from apparent wind
  const apparentWind = (windDir - currentCOG + 360) % 360;
  const windOptimalAngle = apparentWind > 180 ? apparentWind - 360 : apparentWind;

  // Calculate True Wind Angle (TWA) for dynamic threshold
  // TWA = absolute difference between wind direction and COG
  const normalizedTWA = calculateTwa(windDir, currentCOG);
  
  // Use dynamic threshold based on point of sail
  const dynamicThreshold = calculateDynamicDeviationThreshold(normalizedTWA);

  // Calculate deviation as percentage of acceptable range
  const deviationPercentage = Math.abs(deviation) / dynamicThreshold;
  const isDeviated = Math.abs(deviation) > dynamicThreshold;

  // Check if significantly off layline (more than 2x dynamic threshold)
  const isOffLayline = Math.abs(deviation) > dynamicThreshold * 2;

  return {
    optimalBearing,
    currentCOG,
    deviation,
    isDeviated,
    deviationPercentage,
    windOptimalAngle,
    apparentWind,
    isOffLayline
  };
}

/**
 * Calculate anchor watch drift
 * Monitors if vessel has drifted beyond acceptable radius
 * 
 * @param anchorLat - Anchor position latitude
 * @param anchorLng - Anchor position longitude
 * @param currentLat - Current latitude
 * @param currentLng - Current longitude
 * @param driftThreshold - Alarm threshold in meters (default 200m)
 * @returns AnchorWatchData object
 */
export function calculateAnchorDrift(
  anchorLat: number,
  anchorLng: number,
  currentLat: number,
  currentLng: number,
  driftThreshold: number = 200
): AnchorWatchData {
  // Calculate distance using Haversine
  const distance = calculateDistance(anchorLat, anchorLng, currentLat, currentLng);
  const driftDistanceMeters = distance * 1852; // Convert nautical miles to meters

  // Calculate bearing of drift
  const driftBearing = calculateBearing(
    anchorLat,
    anchorLng,
    currentLat,
    currentLng
  );

  const isDrifting = driftDistanceMeters > driftThreshold;

  return {
    isAnchored: true,
    anchorLat,
    anchorLng,
    currentLat,
    currentLng,
    driftDistance: driftDistanceMeters,
    driftBearing,
    isDrifting,
    driftThreshold
  };
}

/**
 * Calculate bearing between two points
 * @returns bearing in degrees (0-359°)
 */
export function calculateBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLng = ((lng2 - lng1 + 180) % 360) - 180;
  const y = Math.sin((dLng * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos((dLng * Math.PI) / 180);

  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  bearing = (bearing + 360) % 360; // Normalize to 0-359
  return bearing;
}

/**
 * Calculate distance between two points (Haversine)
 * @returns distance in nautical miles
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  return distance * 0.539957; // Convert to nautical miles
}

/**
 * Calculate ETA based on distance and speed
 * @param distanceNM - Distance in nautical miles
 * @param speedKnots - Speed in knots
 * @returns ETA string in ISO format, or null if invalid inputs
 */
export function calculateETA(distanceNM: number, speedKnots: number): string | null {
  if (speedKnots <= 0 || distanceNM <= 0) {
    return null;
  }

  // Calculate time in hours
  const hours = distanceNM / speedKnots;
  
  // Add to current time
  const now = new Date();
  const eta = new Date(now.getTime() + hours * 60 * 60 * 1000);

  return eta.toISOString();
}
