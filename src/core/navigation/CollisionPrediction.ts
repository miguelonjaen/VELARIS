/**
 * PHASE 1: Collision Prediction Engine
 * 
 * Pure mathematical motor for AIS collision prediction.
 * No dependencies on React, Supabase, AISStream, App state, DOM, or Leaflet.
 * 
 * Inputs:
 *   - OwnShip: { lat, lng, sog (knots), cog (degrees 0-359) }
 *   - Target: { lat, lng, sog (knots), cog (degrees 0-359) }
 *   - now?: Date (optional reference time)
 * 
 * Outputs:
 *   - CPA (Closest Point of Approach) in nautical miles
 *   - TCPA (Time to CPA) in hours
 *   - TCA (Time of Closest Approach) as Date
 *   - closingSpeed (NM/h, > 0 means approaching)
 *   - relativeBearing (0-360°, where target is relative to own ship)
 *   - isApproaching (simplified: closingSpeed > 0 && tcpaHours > 0)
 * 
 * Local Tangential Projection (ENU):
 *   - Centered on OwnShip position
 *   - North = Δlat * 60 NM (1° = 60 NM at equator)
 *   - East = Δlng * 60 NM * cos(latitude)
 *   - Approximation is valid for coastal navigation (distances < 200 NM)
 * 
 * Velocity Convention:
 *   - COG = compass bearing (0° = North, 90° = East, 180° = South, 270° = West)
 *   - SOG = speed over ground in knots
 *   - East velocity = SOG * sin(COG°)
 *   - North velocity = SOG * cos(COG°)
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const NM_PER_DEGREE_LAT = 60; // 1° latitude = 60 NM

/**
 * Ship/Contact vessel
 */
export interface Vessel {
  lat: number;
  lng: number;
  sog: number; // knots
  cog: number; // degrees (0-359, 0=North)
}

/**
 * Result of collision prediction
 */
export interface CollisionPredictionResult {
  /** Closest Point of Approach in nautical miles (null if no meaningful solution) */
  cpaNm: number | null;
  
  /** Time to CPA in hours (null if already passed or no approach) */
  tcpaHours: number | null;
  
  /** Absolute time of closest approach (null if already passed or no approach) */
  tca: Date | null;
  
  /** Closing speed in NM/h (> 0 = approaching, <= 0 = separating or parallel) */
  closingSpeed: number;
  
  /** Relative bearing from own ship to target (0-360°) */
  relativeBearing: number;
  
  /** Simple boolean: are we approaching in both distance and time? */
  isApproaching: boolean;
  
  // Auxiliary fields for debugging and future phases
  relativeEast?: number;  // Position of target relative to own ship (East component, NM)
  relativeNorth?: number; // Position of target relative to own ship (North component, NM)
  relativeSpeed?: number; // Magnitude of relative velocity (NM/h)
}

/**
 * Local ENU position and velocity
 */
interface LocalVector {
  east: number;
  north: number;
}

/**
 * Convert latitude/longitude to local ENU coordinates
 * Origin at ownShip position
 * 
 * @param ownShip Reference point (origin of ENU frame)
 * @param target Point to convert
 * @returns ENU position in nautical miles
 */
function toLocalENU(ownShip: Vessel, target: Vessel): LocalVector {
  const dLat = target.lat - ownShip.lat;
  const dLng = target.lng - ownShip.lng;
  
  // North: 1° latitude ≈ 60 NM
  const north = dLat * NM_PER_DEGREE_LAT;
  
  // East: 1° longitude ≈ 60 NM * cos(latitude)
  // Use average latitude for better accuracy
  const avgLatRad = ((ownShip.lat + target.lat) / 2) * DEG_TO_RAD;
  const east = dLng * NM_PER_DEGREE_LAT * Math.cos(avgLatRad);
  
  return { east, north };
}

/**
 * Convert COG + SOG to ENU velocity components
 * 
 * @param sog Speed over ground in knots
 * @param cog Course over ground in degrees (0=North, 90=East, etc.)
 * @returns Velocity in NM/h
 */
function cogSogToVelocity(sog: number, cog: number): LocalVector {
  const cogRad = cog * DEG_TO_RAD;
  
  // North component (cos for North)
  const north = sog * Math.cos(cogRad);
  
  // East component (sin for East)
  const east = sog * Math.sin(cogRad);
  
  return { east, north };
}

/**
 * Dot product of two 2D vectors
 */
function dotProduct(v1: LocalVector, v2: LocalVector): number {
  return v1.east * v2.east + v1.north * v2.north;
}

/**
 * Magnitude of a 2D vector
 */
function magnitude(v: LocalVector): number {
  return Math.sqrt(v.east * v.east + v.north * v.north);
}

/**
 * Normalize angle to [0, 360) degrees
 */
function normalizeBearing(bearing: number): number {
  let normalized = bearing % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  return normalized;
}

/**
 * Calculate collision prediction parameters
 * 
 * @param ownShip Own vessel position and motion
 * @param target AIS contact position and motion
 * @param now Reference time (defaults to Date.now())
 * @returns Collision prediction result
 */
export function calculateCollisionPrediction(
  ownShip: Vessel,
  target: Vessel,
  now: Date = new Date()
): CollisionPredictionResult {
  
  // Convert to local ENU frame
  const relativePos = toLocalENU(ownShip, target);
  
  // Convert velocities
  const ownVel = cogSogToVelocity(ownShip.sog, ownShip.cog);
  const targetVel = cogSogToVelocity(target.sog, target.cog);
  
  // Relative position and velocity
  const relativeVel: LocalVector = {
    east: targetVel.east - ownVel.east,
    north: targetVel.north - ownVel.north
  };
  
  // Current distance
  const currentDistance = magnitude(relativePos);
  
  // Magnitude of relative velocity
  const relVelMag = magnitude(relativeVel);
  
  // Calculate TCPA
  // TCPA = -dot(relPos, relVel) / |relVel|²
  let tcpaHours: number | null = null;
  let cpaNm: number | null = null;
  
  if (relVelMag > 1e-6) {
    // Relative velocity is not zero
    const numerator = -dotProduct(relativePos, relativeVel);
    const denominator = relVelMag * relVelMag;
    tcpaHours = numerator / denominator;
    
    if (tcpaHours >= 0) {
      // Valid future approach; calculate CPA
      const closestPos: LocalVector = {
        east: relativePos.east + relativeVel.east * tcpaHours,
        north: relativePos.north + relativeVel.north * tcpaHours
      };
      cpaNm = magnitude(closestPos);
    } else {
      // TCPA is negative: closest approach was in the past
      tcpaHours = null;
      cpaNm = currentDistance; // Current distance is the minimum achieved
    }
  } else {
    // Relative velocity is zero (parallel or stationary relative to each other)
    tcpaHours = null;
    cpaNm = currentDistance;
  }
  
  // Calculate closing speed (rate of distance change)
  // closingSpeed = -dot(relPos, relVel) / |relPos|
  let closingSpeed = 0;
  if (currentDistance > 1e-6) {
    closingSpeed = -dotProduct(relativePos, relativeVel) / currentDistance;
  }
  
  // Calculate relative bearing (where target is relative to own ship)
  // Bearing = atan2(east, north) normalized to [0, 360)
  let relativeBearing = Math.atan2(relativePos.east, relativePos.north) * RAD_TO_DEG;
  relativeBearing = normalizeBearing(relativeBearing);
  
  // Determine if approaching
  const isApproaching = closingSpeed > 1e-6 && tcpaHours !== null && tcpaHours > 0;
  
  // Calculate TCA
  let tca: Date | null = null;
  if (tcpaHours !== null && tcpaHours > 0) {
    // Convert hours to milliseconds and add to reference time
    const tcaMs = now.getTime() + tcpaHours * 3600 * 1000;
    tca = new Date(tcaMs);
  }
  
  return {
    cpaNm: cpaNm !== null ? cpaNm : null,
    tcpaHours: tcpaHours !== null && tcpaHours > 0 ? tcpaHours : null,
    tca,
    closingSpeed,
    relativeBearing,
    isApproaching,
    relativeEast: relativePos.east,
    relativeNorth: relativePos.north,
    relativeSpeed: relVelMag
  };
}
