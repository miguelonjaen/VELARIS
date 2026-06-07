/**
 * Matriz Polar de Rendimiento - SmartShip PRO
 * Mapea: TWS (Viento Real) + TWA (Ángulo Real) -> Target Speed (Knots)
 */

export interface PolarData {
  tws: number;
  angles: { [twa: number]: number };
}

export const STANDARD_40FT_POLARS: PolarData[] = [
  {
    tws: 6,
    angles: { 32: 3.2, 45: 4.5, 60: 5.2, 90: 5.8, 120: 5.4, 150: 4.1, 180: 3.2 }
  },
  {
    tws: 10,
    angles: { 32: 4.8, 45: 6.1, 60: 6.8, 90: 7.4, 120: 7.1, 150: 6.2, 180: 5.4 }
  },
  {
    tws: 16,
    angles: { 32: 5.9, 45: 7.2, 60: 7.9, 90: 8.4, 120: 8.3, 150: 7.9, 180: 7.2 }
  },
  {
    tws: 20,
    angles: { 32: 6.4, 45: 7.6, 60: 8.2, 90: 8.9, 120: 8.8, 150: 8.4, 180: 7.8 }
  }
];

/**
 * Calcula la velocidad teórica aproximada mediante búsqueda de vecino cercano
 */
export function getTargetSpeed(tws: number, twa: number): number {
  if (tws < 4) return 0;
  
  // Normalizar TWA a 0-180
  const absTwa = Math.abs(twa);
  
  // Buscar la fila de TWS más cercana
  const closestTwsRow = STANDARD_40FT_POLARS.reduce((prev, curr) => 
    Math.abs(curr.tws - tws) < Math.abs(prev.tws - tws) ? curr : prev
  );

  // Buscar el ángulo más cercano en esa fila
  const angles = Object.keys(closestTwsRow.angles).map(Number);
  const closestAngle = angles.reduce((prev, curr) => 
    Math.abs(curr - absTwa) < Math.abs(prev - absTwa) ? curr : prev
  );

  return closestTwsRow.angles[closestAngle];
}

export function calculateEfficiency(currentSog: number, targetSpeed: number): number {
  if (targetSpeed <= 0) return 100;
  const efficiency = (currentSog / targetSpeed) * 100;
  return Math.min(Math.max(efficiency, 0), 120); // Cap at 120% for extreme surfers
}