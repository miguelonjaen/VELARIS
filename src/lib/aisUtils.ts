import { calculateDistanceNM } from './utils';
import { TargetAIS } from "@/tactical/models/TargetAIS";



/**
 * Calcula el CPA (Closest Point of Approach) y TCPA entre nuestro barco y un objetivo.
 * Utiliza una aproximación local proyectada para mayor eficiencia en tiempo real.
 */
export function calculateCollisionMetrics(
  ownPos: { lat: number; lng: number; sog: number; cog: number },
  target: TargetAIS
): { cpa: number; tcpa: number; risk: boolean } {
  // Conversión de nudos a metros por segundo
  const knToMs = 0.514444;
  
  // Diferencias de posición en metros (aproximación local)
  const dx = (target.lng - ownPos.lng) * 111320 * Math.cos(ownPos.lat * Math.PI / 180);
  const dy = (target.lat - ownPos.lat) * 111111;

  // Componentes de velocidad (norte = y, este = x)
  const vOx = ownPos.sog * knToMs * Math.sin(ownPos.cog * Math.PI / 180);
  const vOy = ownPos.sog * knToMs * Math.cos(ownPos.cog * Math.PI / 180);
  
  const vTx = target.sog * knToMs * Math.sin(target.cog * Math.PI / 180);
  const vTy = target.sog * knToMs * Math.cos(target.cog * Math.PI / 180);

  // Velocidad relativa
  const vrx = vTx - vOx;
  const vry = vTy - vOy;

  const vRelSq = vrx * vrx + vry * vry;

  // Si no hay velocidad relativa, no hay TCPA definido
  if (vRelSq < 0.01) return { cpa: Math.sqrt(dx * dx + dy * dy), tcpa: Infinity, risk: false };

  // Tiempo al punto de máxima aproximación (TCPA) en segundos
  const tcpaSec = -(dx * vrx + dy * vry) / vRelSq;
  const tcpaMin = tcpaSec / 60;

  // Distancia en el CPA
  let cpaDist = 0;
  if (tcpaSec < 0) {
    // Ya pasamos el punto o nos alejamos
    cpaDist = Math.sqrt(dx * dx + dy * dy);
  } else {
    const cpaX = dx + vrx * tcpaSec;
    const cpaY = dy + vry * tcpaSec;
    cpaDist = Math.sqrt(cpaX * cpaX + cpaY * cpaY);
  }

  // Criterios de riesgo: CPA < 500m y TCPA < 5 min
  const isRisk = tcpaMin > 0 && tcpaMin < 5 && cpaDist < 500;

  return { cpa: cpaDist, tcpa: tcpaMin, risk: isRisk };
}