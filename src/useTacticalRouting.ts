import { useMemo } from 'react';
import { getTargetSpeed, calculateEfficiency } from './polarTable';
import { calculateBearing } from './lib/utils';
import { calculateTwa } from './lib/useWeather';

interface TacticalRoutingProps {
  shipPos: { lat: number; lng: number } | null;
  targetPos: { lat: number; lng: number } | null;
  sog: number;
  cog: number;
  tws: number;
  twd: number;
}

export const useTacticalRouting = ({ shipPos, targetPos, sog, cog, tws, twd }: TacticalRoutingProps) => {
  return useMemo(() => {
    // 1. Rendimiento Polar
    const twa = calculateTwa(twd, cog);
    const targetSpeed = getTargetSpeed(tws, twa);
    const efficiency = calculateEfficiency(sog, targetSpeed);

    // 2. Enrutamiento (Tacking Advisor)
    let suggestedPath: [number, number][] = [];
    let advisorMessage = "Mantener rumbo actual.";
    let severity: 'info' | 'warning' | 'critical' = 'info';

    if (shipPos && targetPos) {
      const bearingToTarget = calculateBearing(shipPos.lat, shipPos.lng, targetPos.lat, targetPos.lng);
      const relativeTargetAngle = calculateTwa(twd, bearingToTarget);

      // Zona muerta (No-go zone) detectada: 45 grados a proa del viento
      if (relativeTargetAngle < 45) {
        severity = 'warning';
        advisorMessage = `Destino en zona muerta. Sugerencia: Bordos a 45° del viento real.`;
        
        // Proyectar un bordo simple táctico (Zig-Zag)
        const tackAngle = 45;
        const offsetDist = 0.01; // Desviación para el waypoint intermedio
        
        // Determinar qué bordo es más favorable (el que nos aleja del peligro o más cercano al rumbo actual)
        const tackHeading = (twd + (cog > twd ? tackAngle : -tackAngle)) % 360;
        
        const midLat = (shipPos.lat + targetPos.lat) / 2 + (Math.cos(tackHeading * Math.PI / 180) * offsetDist);
        const midLng = (shipPos.lng + targetPos.lng) / 2 + (Math.sin(tackHeading * Math.PI / 180) * offsetDist);
        
        suggestedPath = [
          [shipPos.lat, shipPos.lng],
          [midLat, midLng],
          [targetPos.lat, targetPos.lng]
        ];
      }
    }

    // 3. Recomendaciones de Eficiencia
    if (efficiency < 85 && sog > 2) {
      severity = 'warning';
      const orza = twa > 45 ? "Orza" : "Arriba";
      advisorMessage = `Rendimiento al ${efficiency.toFixed(0)}%. ${orza} 5° para optimizar VMG.`;
    }

    // 4. Viento Aparente (Simulado simplificado para HUD)
    // En un sistema real, AWA/AWS se obtiene de los sensores, aquí lo calculamos vectorialmente
    const awa = twa * 0.85; // Aproximación visual para el HUD

    return {
      efficiency,
      targetSpeed,
      suggestedPath,
      advisorMessage,
      severity,
      twa,
      awa
    };
  }, [shipPos, targetPos, sog, cog, tws, twd]);
};
