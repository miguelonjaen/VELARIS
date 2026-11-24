import { useEffect, useRef } from 'react';
import { formatTacticalAdvisory, generateTacticalAlerts, type NavigationTelemetry, type TacticalAlert } from '../lib/tacticalAlertSystem';

export const TACTICAL_XTE_NM = 0.15;
export const TACTICAL_APPROACH_NM = 0.3;
const EVENT_COOLDOWN_MS = 10 * 60_000;

export type VoyageNotice = TacticalAlert & { key: string; journal?: boolean };
type AdvisorInput = {
  scope: string | null;
  telemetry: NavigationTelemetry | null;
  notices: VoyageNotice[];
  saveLogEntry: (title: string, description: string, category: string) => Promise<void>;
};

export function useTacticalAdvisor({ scope, telemetry, notices, saveLogEntry }: AdvisorInput) {
  const alerts: VoyageNotice[] = scope ? [...notices, ...(telemetry ? generateTacticalAlerts(telemetry) : [])
    .filter(alert => alert.type === 'safety' || alert.type === 'sail')
    .map(alert => ({ ...alert, key: `wind:${telemetry?.windSource}:${alert.type}`, journal: alert.type === 'safety' }))] : [];
  const advisory = formatTacticalAdvisory(alerts);
  const events = useRef({ scope, at: new Map<string, number>() });
  useEffect(() => {
    if (events.current.scope !== scope) events.current = { scope, at: new Map() };
    const at = events.current.at;
    const now = Date.now();
    for (const [key, stamp] of at) if (now - stamp >= EVENT_COOLDOWN_MS && key.endsWith(':cleared')) at.delete(key);
    for (const alert of alerts) {
      if (!alert.journal) continue;
      const key = `${alert.key}:${alert.severity}`;
      if (at.has(key)) continue;
      const cleared = at.get(`${key}:cleared`);
      if (cleared !== undefined && now - cleared < EVENT_COOLDOWN_MS) continue;
      at.set(key, now);
      void saveLogEntry(`Aviso táctico · ${alert.key}`, alert.message, 'NAVEGACIÓN TÁCTICA')
        .catch(error => console.error('Bitácora del asesor táctico:', error));
    }
    for (const key of at.keys()) {
      if (key.endsWith(':cleared')) continue;
      if (!alerts.some(alert => alert.journal && `${alert.key}:${alert.severity}` === key)) {
        at.delete(key);
        at.set(`${key}:cleared`, now);
      }
    }
  }, [alerts, scope, saveLogEntry]);
  return { advisory, alerts };
}
