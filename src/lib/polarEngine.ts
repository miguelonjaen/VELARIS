/**
 * Motor de Polares Táctico - SmartShip Pro
 * Gestiona el rendimiento teórico vs real y cálculos de VMG.
 */

export interface PolarPoint {
  tws: number; // True Wind Speed (kt)
  twa: number; // True Wind Angle (deg)
  speed: number; // Boat Speed (kt)
}

// Polares simplificadas para un Crucero-Regata de 40 pies (ej. Beneteau First)
const SAILBOAT_POLARS: PolarPoint[] = [
  { tws: 6, twa: 45, speed: 4.2 }, { tws: 6, twa: 90, speed: 5.5 }, { tws: 6, twa: 150, speed: 4.5 },
  { tws: 12, twa: 45, speed: 6.8 }, { tws: 12, twa: 90, speed: 8.2 }, { tws: 12, twa: 150, speed: 7.4 },
  { tws: 20, twa: 45, speed: 7.5 }, { tws: 20, twa: 90, speed: 9.5 }, { tws: 20, twa: 150, speed: 10.2 },
];

/**
 * Sugiere el nivel de rizo óptimo basado en la intensidad del viento real.
 */
export const getOptimalReef = (tws: number): { reef: number; advice: string } => {
  if (tws < 18) return { reef: 0, advice: "Toda la superficie (Full Main)" };
  if (tws < 24) return { reef: 1, advice: "Primer Rizo (1st Reef)" };
  if (tws < 32) return { reef: 2, advice: "Segundo Rizo (2nd Reef)" };
  return { reef: 3, advice: "Capa / Tercer Rizo (Storm Gear)" };
};

/**
 * Calcula la Velocidad Efectiva hacia el viento o destino (Velocity Made Good).
 */
export const calculateVMG = (speed: number, angleDeg: number): number => {
  const angleRad = (angleDeg * Math.PI) / 180;
  return Math.abs(speed * Math.cos(angleRad));
};

/**
 * Detecta si el rumbo deseado es una ceñida imposible (en el ángulo muerto).
 * Típicamente < 45° para cruceros estándar.
 */
export const isUpwindImpossible = (
  targetBearing: number, 
  windDir: number, 
  deadZone: number = 45
): boolean => {
  // Normalización del ángulo entre 0 y 180
  const diff = Math.abs((targetBearing - windDir + 180 + 360) % 360 - 180);
  return diff < deadZone;
};

/**
 * Busca el rendimiento teórico en la tabla de polares para las condiciones dadas.
 */
export const getTargetPerformance = (tws: number, twa: number): number => {
  if (tws === 0) return 0;
  
  // Búsqueda del punto más cercano en la tabla de polares
  // Nota: En un sistema de regata real, esto realizaría una interpolación bilineal
  const closest = SAILBOAT_POLARS.reduce((prev, curr) => {
    const prevDiff = Math.abs(prev.tws - tws) + Math.abs(prev.twa - twa);
    const currDiff = Math.abs(curr.tws - tws) + Math.abs(curr.twa - twa);
    return currDiff < prevDiff ? curr : prev;
  });
  
  return closest.speed;
};

export interface VesselPerformanceInput {
  sog: number;
  cog: number;
  windSpeed: number;
  windDir: number;
}

export interface VesselPerformanceResult {
  ratio: number;
  targetSpeed: number;
  note: string;
}

export const calculateVesselPerformance = ({ sog, cog, windSpeed, windDir }: VesselPerformanceInput): VesselPerformanceResult => {
  const twa = Math.abs(((cog - windDir + 180 + 360) % 360) - 180);
  const targetSpeed = getTargetPerformance(windSpeed, twa);
  const ratio = targetSpeed > 0 ? Math.min(Math.max(sog / targetSpeed, 0), 1.2) : 0;
  return {
    ratio,
    targetSpeed,
    note: targetSpeed > 0 ? `TWA ${twa.toFixed(0)}°` : 'Calma'
  };
};

/**
 * Genera waypoints tácticos para navegación en bordos (Tacking).
 * Utilizado por el motor de IA para proponer derrotas en zig-zag.
 */
export const generateTackingRoute = (
  start: [number, number],
  end: [number, number],
  windDir: number,
  tackAngle: number = 45
): [number, number][] => {
  const waypoints: [number, number][] = [start];
  
  // Cálculo simplificado de un punto intermedio para el bordo
  const midLat = (start[0] + end[0]) / 2;
  const midLng = (start[1] + end[1]) / 2;
  
  // Desviación lateral basada en el ángulo de tack
  // Esto es una aproximación geométrica para visualización en mapa
  const offset = 0.015; 
  
  // Determinamos si el primer bordo es a estribor o babor basado en la posición relativa
  waypoints.push([midLat + offset, midLng + offset]);
  waypoints.push(end);
  
  return waypoints;
};

/**
 * Calcula el ángulo de viento aparente (AWA) a partir del real (TWA) y velocidades.
 */
export const calculateAWA = (tws: number, twa: number, bspd: number): number => {
  const twaRad = (twa * Math.PI) / 180;
  const v_wind_x = tws * Math.cos(twaRad) + bspd;
  const v_wind_y = tws * Math.sin(twaRad);
  
  return (Math.atan2(v_wind_y, v_wind_x) * 180) / Math.PI;
};

/**
 * Calcula la velocidad de viento aparente (AWS).
 */
export const calculateAWS = (tws: number, twa: number, bspd: number): number => {
  const twaRad = (twa * Math.PI) / 180;
  return Math.sqrt(
    Math.pow(tws * Math.sin(twaRad), 2) + 
    Math.pow(tws * Math.cos(twaRad) + bspd, 2)
  );
};