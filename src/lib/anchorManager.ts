import { calculateDistanceNM } from './utils';

export interface AnchorStatus {
  isDrifting: boolean;
  trend: 'stable' | 'drifting' | 'swinging';
  distance: number; // metros
  radius: number; // metros
}

/**
 * Calcula el radio de borneo teórico.
 * @param depth Profundidad en metros.
 * @param chain Cadena desplegada en metros.
 * @param safetyMargin Margen de seguridad (m).
 */
export const calculateSwingRadius = (depth: number, chain: number, safetyMargin: number = 5): number => {
  if (chain <= depth) return depth + safetyMargin;
  // Pitágoras para encontrar la proyección horizontal + margen
  const horizontalDist = Math.sqrt(Math.pow(chain, 2) - Math.pow(depth, 2));
  return horizontalDist + safetyMargin;
};

/**
 * Analiza la tendencia de garreo basada en el histórico de distancias.
 */
export const analyzeAnchorTrend = (
  history: number[], 
  radius: number
): 'stable' | 'drifting' | 'swinging' => {
  if (history.length < 5) return 'stable';

  const lastDist = history[history.length - 1];
  const prevDist = history[history.length - 5];

  // Si excedemos el radio de borneo
  if (lastDist > radius) return 'drifting';

  // Análisis vectorial: Si el desplazamiento es sostenido en una dirección (no circular)
  const recent = history.slice(-10);
  const avgDist = recent.reduce((a, b) => a + b, 0) / recent.length;
  const isMovingAway = lastDist > avgDist && lastDist > radius * 0.85;
  
  if (isMovingAway) return 'drifting';

  // Si oscila pero dentro del radio
  const variance = Math.max(...history.slice(-10)) - Math.min(...history.slice(-10));
  if (variance > radius * 0.4) return 'swinging';

  return 'stable';
};

/**
 * Registra automáticamente eventos de fondeo en la bitácora.
 */
export const formatAnchorLog = (
  vesselName: string,
  depth: number,
  chain: number,
  wind: number,
  drift: number
): string => {
  return `MONITOR DE FONDEO [${vesselName}]: Profundidad ${depth}m | Cadena ${chain}m. Viento actual: ${wind}kt. Deriva detectada: ${drift.toFixed(1)}m.`;
};