import { useEffect, useMemo, useState } from 'react';
import { generateTacticalAlerts, formatTacticalAdvisory, NavigationTelemetry, TacticalAlert } from '../lib/tacticalAlertSystem';

export type TacticalAdvisorAction = {
  label: string;
  onClick: () => Promise<void> | void;
  variant?: 'primary' | 'secondary';
};

interface UseTacticalAdvisorProps {
  shipPos: { lat: number; lng: number } | null;
  targetPos: { lat: number; lng: number } | null;
  sog: number;
  cog: number;
  windSpeed: number;
  windDir: number;
  currentSailConfig?: string;
  saveLogEntry: (titulo: string, descripcion: string, categoria?: string) => Promise<void>;
}

export const useTacticalAdvisor = ({
  shipPos,
  targetPos,
  sog,
  cog,
  windSpeed,
  windDir,
  currentSailConfig,
  saveLogEntry
}: UseTacticalAdvisorProps) => {
  const telemetry = useMemo<NavigationTelemetry | null>(() => {
    if (!shipPos || !targetPos) return null;
    return {
      lat: shipPos.lat,
      lng: shipPos.lng,
      cog,
      sog,
      windDir,
      windSpeed,
      waypointLat: targetPos.lat,
      waypointLng: targetPos.lng,
      currentSailConfig
    };
  }, [shipPos, targetPos, cog, sog, windDir, windSpeed, currentSailConfig]);

  const alerts = useMemo<TacticalAlert[]>(() => {
    if (!telemetry) return [];
    return generateTacticalAlerts(telemetry);
  }, [telemetry]);

  const advisory = useMemo(() => {
    if (!alerts.length) {
      return {
        message: 'Almirante, sistemas estables. Sin alertas tácticas activas.',
        priority: 'info' as const
      };
    }
    return formatTacticalAdvisory(alerts);
  }, [alerts]);

  const [loggedAlertKey, setLoggedAlertKey] = useState('');

  useEffect(() => {
    if (!telemetry || alerts.length === 0) return;

    const relevantAlerts = alerts.filter(alert => alert.severity === 'warning' || alert.severity === 'critical');
    if (relevantAlerts.length === 0) return;

    const alertKey = relevantAlerts.map(alert => `${alert.type}:${alert.severity}:${alert.message}`).join('|');
    if (alertKey === loggedAlertKey) return;

    relevantAlerts.forEach(async alert => {
      try {
        await saveLogEntry(
          alert.logbookEntry?.titulo || `Alerta táctica: ${alert.type}`,
          alert.logbookEntry?.descripcion || alert.message,
          alert.logbookEntry?.categoria || 'NAVEGACIÓN TÁCTICA'
        );
      } catch (error) {
        console.error('Error al guardar alerta táctica:', error);
      }
    });

    setLoggedAlertKey(alertKey);
  }, [alerts, loggedAlertKey, saveLogEntry, telemetry]);

  const actions: TacticalAdvisorAction[] = useMemo(() => {
    if (!alerts.length) return [];
    const primary = alerts[0];
    return [
      {
        label: primary.severity === 'critical' ? 'Guardar alerta crítica' : 'Guardar recomendación',
        variant: primary.severity === 'critical' ? 'primary' : 'secondary',
        onClick: async () => {
          await saveLogEntry(
            primary.logbookEntry?.titulo || `Registro táctico: ${primary.type}`,
            primary.logbookEntry?.descripcion || primary.message,
            primary.logbookEntry?.categoria || 'NAVEGACIÓN TÁCTICA'
          );
        }
      }
    ];
  }, [alerts, saveLogEntry]);

  return {
    advisory,
    alerts,
    actions
  };
};
