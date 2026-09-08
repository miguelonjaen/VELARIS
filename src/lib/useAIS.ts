import { useState, useEffect } from 'react';
import { calculateCollisionMetrics } from "../lib/aisUtils";
import { TargetAIS } from "@/tactical/models/TargetAIS";
export const useAIS = (ownShip: { lat: number; lng: number; sog: number; cog: number } | null) => {
  const [targets, setTargets] = useState<TargetAIS[]>([]);

  // Inicialización de tráfico simulado
  useEffect(() => {
    if (!ownShip) return;
    
    const initialTargets: TargetAIS[] = [
      { mmsi: '224123456', nombre: 'MSC GAIA', tipo: 'Carguero', lat: ownShip.lat + 0.02, lng: ownShip.lng + 0.01, cog: 240, sog: 18, status: 'Navegando' },
      { mmsi: '224987654', nombre: 'SEA STAR', tipo: 'Velero', lat: ownShip.lat - 0.01, lng: ownShip.lng + 0.02, cog: 45, sog: 6, status: 'Navegando' },
      { mmsi: '224555444', nombre: 'PESCA SUR V', tipo: 'Pesquero', lat: ownShip.lat + 0.005, lng: ownShip.lng - 0.015, cog: 120, sog: 3, status: 'Navegando' },
      { mmsi: '224000111', nombre: 'LADY BLUE', tipo: 'Yate', lat: ownShip.lat + 0.01, lng: ownShip.lng - 0.005, cog: 10, sog: 0, status: 'Fondeado' },
    ];
    setTargets(prev => prev.length > 0 ? prev : initialTargets);
  }, [ownShip]);

  // Bucle de actualización cada 3 segundos
  useEffect(() => {
    if (!ownShip) return;

    const interval = setInterval(() => {
      setTargets(prev => prev.map(t => {
        // Mover barcos según su SOG/COG
        const speedDeg = (t.sog * 0.514444) / 111111; // aprox deg/s
        const deltaLat = Math.cos(t.cog * Math.PI / 180) * speedDeg * 3;
        const deltaLng = Math.sin(t.cog * Math.PI / 180) * speedDeg * 3;

        const newLat = t.lat + deltaLat;
        const newLng = t.lng + deltaLng;

        // Calcular métricas de colisión
        const metrics = calculateCollisionMetrics(ownShip, { ...t, lat: newLat, lng: newLng });

        return {
          ...t,
          lat: newLat,
          lng: newLng,
          cpa: metrics.cpa,
          tcpa: metrics.tcpa,
          isCollisionRisk: metrics.risk
        };
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, [ownShip]);

  return targets;
};