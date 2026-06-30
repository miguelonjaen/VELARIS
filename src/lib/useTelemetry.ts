import { useState, useEffect, useMemo } from 'react';
import { VesselVector, enrichAisTarget } from '../lib/ais';
import { 
  createInitialSensorQualityMap, 
  markSensorUpdated, 
  refreshSensorQualityMap, 
  getOverallSensorConfidence,
  SensorId,
  SensorQualityMap
} from '../lib/sensorQuality';
import { updateRealSensors } from "@/telemetry/helpers/SensorQualityUpdater";

interface TelemetryProps {
  selectedShipId: string | null;
  shipPosition: { lat: number; lng: number } | null;
  simulatedSog: number;
  cog: number;
}

export const useTelemetry = ({ selectedShipId, shipPosition, simulatedSog, cog }: TelemetryProps) => {
  const [aisTargets, setAisTargets] = useState<any[]>([]);
  const [sensorQuality, setSensorQuality] = useState<SensorQualityMap>(createInitialSensorQualityMap);
  const [dataSource, setDataSource] = useState<Record<string, 'real' | 'simulated'>>({
    gps: 'simulated', heading: 'simulated', sog: 'simulated', depth: 'simulated', wind: 'simulated', ais: 'simulated'
  });

  const sensorConfidence = useMemo(() => getOverallSensorConfidence(sensorQuality), [sensorQuality]);

  const ownShipVector = useMemo<VesselVector | null>(() => {
    if (!shipPosition) return null;
    return { lat: shipPosition.lat, lng: shipPosition.lng, sog: simulatedSog, cog };
  }, [shipPosition, simulatedSog, cog]);

  const tacticalAisTargets = useMemo(
    () => aisTargets.map(target => enrichAisTarget(ownShipVector, target)),
    [aisTargets, ownShipVector]
  );

  useEffect(() => {

  const handleTelemetry = (data: any) => {

    if (!data?.type) return;

    switch (data.type) {

      case 'GPS':

        updateRealSensors(
          ['gps', 'heading', 'sog'],
          setSensorQuality,
          setDataSource
        );

        break;

      case 'WIND':

        updateRealSensors(
          ['wind'],
          setSensorQuality,
          setDataSource
        );

        break;

      case 'DEPTH':

        updateRealSensors(
          ['depth'],
          setSensorQuality,
          setDataSource
        );

        break;

      case 'AIS':

        setAisTargets(prev => {

          const target = enrichAisTarget(ownShipVector, data);

          const targetId = target.id || target.mmsi;

          return [
            target,
            ...prev.filter(item => (item.id || item.mmsi) !== targetId)
          ].slice(0, 30);

        });

        updateRealSensors(
          ['ais'],
          setSensorQuality,
          setDataSource
        );

        break;

    }

  };

  const api = window.smartshipAPI;

  if (api?.on) {

    api.on('vessel-telemetry', handleTelemetry);

    return () =>
      api.removeListener('vessel-telemetry', handleTelemetry);

  }

}, [ownShipVector]);

useEffect(() => {

  const interval = setInterval(() => {

    setSensorQuality(prev =>
      refreshSensorQualityMap(prev, dataSource)
    );

  }, 1000);

  return () => clearInterval(interval);

}, [dataSource]);

return {
  sensorQuality,
  sensorConfidence,
  tacticalAisTargets,

  setAisTargets,

  dataSource,
  setDataSource
};

};