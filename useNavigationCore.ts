import { useState, useEffect, useCallback, useRef } from 'react';
import { calculateDistanceNM, calculateBearing } from '@lib/utils';
import { calculateLaylineDeviation, calculateAnchorDrift, calculateETA } from '@lib/laylineCalculator';
import { VELARISAlarm, AlarmSeverity, ProcessedWeather, ShipData } from '@/shared/types';

interface NavigationCoreProps {
  shipPosition: { lat: number; lng: number } | null;
  weather: ProcessedWeather;
  selectedShip: ShipData | null;
  simulatedSog: number;
  isTravesiaActive: boolean;
  addAlarm: (type: VELARISAlarm['type'], severity: AlarmSeverity, message: string, value: number) => void;
  removeAlarmByType: (type: VELARISAlarm['type']) => void;
}

export const useNavigationCore = ({
  shipPosition,
  weather,
  selectedShip,
  simulatedSog,
  isTravesiaActive,
  addAlarm,
  removeAlarmByType
}: NavigationCoreProps) => {
  const [navPlan, setNavPlan] = useState({
    targetCoords: null as { lat: number; lng: number } | null,
    targetName: '',
    distanceNM: 0,
    eta: '--:--',
    btw: 0,
    vmg: 0,
    xte: 0,
    isCalculating: false
  });

  const [anchorPosition, setAnchorPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [isAnchorWatchActive, setIsAnchorWatchActive] = useState(false);

  const calculateRoute = useCallback((start: { lat: number; lng: number }, end: { lat: number; lng: number }) => {
    const dist = calculateDistanceNM(start.lat, start.lng, end.lat, end.lng);
    const avgSpeed = simulatedSog > 0 ? simulatedSog : 15;
    const hours = dist / avgSpeed;
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return {
      distance: dist,
      eta: `${h}h ${m}m`
    };
  }, [simulatedSog]);

  const updateNavigationPlan = useCallback((coords: { lat: number; lng: number }, name: string) => {
    const currentPos = shipPosition || { lat: 36.7215, lng: -3.5235 };
    const { distance, eta } = calculateRoute(currentPos, coords);
    const btw = calculateBearing(currentPos.lat, currentPos.lng, coords.lat, coords.lng);
    
    // Cálculo de VMG (Velocity Made Good) hacia el Waypoint
    const sog = simulatedSog > 0 ? simulatedSog : 0;
    const cog = selectedShip?.cog || 0;
    // VMG = SOG * cos(angular difference between COG and BTW)
    const angleDiff = (btw - cog) * (Math.PI / 180);
    const vmg = sog * Math.cos(angleDiff);
    
    setNavPlan(prev => ({
      ...prev,
      targetCoords: coords,
      targetName: name,
      distanceNM: Number(distance.toFixed(2)),
      eta,
      btw: Math.round(btw),
      vmg: Number(vmg.toFixed(1)),
      xte: 0
    }));
  }, [shipPosition, calculateRoute, selectedShip?.cog, simulatedSog]);

  // Sincronización continua de VMG si cambia la posición o velocidad
  useEffect(() => {
    if (navPlan.targetCoords && shipPosition) {
      updateNavigationPlan(navPlan.targetCoords, navPlan.targetName);
    }
  }, [shipPosition, simulatedSog, selectedShip?.cog, navPlan.targetCoords, navPlan.targetName, updateNavigationPlan]);

  // Monitor de Laylines (Optimización de VMG)
  useEffect(() => {
    if (!isTravesiaActive || !navPlan.targetCoords || !shipPosition) return;

    const laylineData = calculateLaylineDeviation(
      shipPosition.lat,
      shipPosition.lng,
      navPlan.targetCoords.lat,
      navPlan.targetCoords.lng,
      selectedShip?.cog || 0,
      weather?.windDir || 0,
      simulatedSog
    );

    if (laylineData.isOffLayline) {
      addAlarm(
        'layline_deviation',
        'warning',
        `Fuera de layline: Desviación ${Math.abs(laylineData.deviation).toFixed(0)}°. Rumbo óptimo: ${Math.round(laylineData.optimalBearing)}°`,
        Math.abs(laylineData.deviation)
      );
    } else {
      removeAlarmByType('layline_deviation');
    }
  }, [isTravesiaActive, navPlan.targetCoords, shipPosition, simulatedSog, weather.windDir, selectedShip, addAlarm, removeAlarmByType]);

  // Monitor de Alarma de Garreo (Anchor Watch)
  useEffect(() => {
    if (!isAnchorWatchActive || !anchorPosition || !shipPosition) return;

    const anchorWatchData = calculateAnchorDrift(
      anchorPosition.lat,
      anchorPosition.lng,
      shipPosition.lat,
      shipPosition.lng,
      200 // Umbral de 200 metros
    );

    if (anchorWatchData.isDrifting) {
      addAlarm(
        'anchor_drift',
        'critical',
        `⚓ ALERTA DE DERIVA: Barco desplazado ${anchorWatchData.driftDistance.toFixed(0)}m del fondeo`,
        anchorWatchData.driftDistance
      );
    } else {
      removeAlarmByType('anchor_drift');
    }
  }, [isAnchorWatchActive, anchorPosition, shipPosition, addAlarm, removeAlarmByType]);

  return {
    navPlan,
    updateNavigationPlan,
    anchorPosition,
    setAnchorPosition,
    isAnchorWatchActive,
    setIsAnchorWatchActive
  };
};