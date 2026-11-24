import { useEffect } from 'react';
import { reportSharedLinkError } from './gaulosLinkStore';
import { loadMissionPlans, type MissionPlan } from '../../core/voyage/missionPlan';
import type { MarineWeatherData } from '../../lib/useMarineWeather';
import type { WeatherData } from '../../lib/useWeather';
import type { AisPanelTarget } from '../traffic/aisPanelModel';
import type { SharedRoute } from './gaulosLinkTypes';

/** Exchange saved route revisions, never activation commands or deletions. Local copies survive disconnect. */
export function useSharedLinkData(shipId: string | null, weather: WeatherData | null, marine: MarineWeatherData | null): void {
  useEffect(() => {
    const api = window.gaulosLink;
    if (!api) return;
    const off = api.onSharedRoute(({ deviceId, route }) => {
      if (!shipId) { reportSharedLinkError("Selecciona un buque para guardar rutas de Droid"); return; }
      try {
        const id = `link-${deviceId}-${route.key}`;
        const plans = loadMissionPlans(localStorage, shipId);
        if (plans.some(p => p.id === id)) return;
        const plan: MissionPlan = { id, version: 1, name: `${route.name} · Droid`, constraints: '', reviewed: false,
          savedAt: Date.now(), waypoints: route.waypoints.map((w, i) => ({ id: `${id}-${i}`, name: w.name, lat: w.lat, lng: w.lon })) };
        localStorage.setItem(`VELARIS_missions:${shipId}`, JSON.stringify([...plans, plan]));
      } catch (error: unknown) { reportSharedLinkError(error); }
    });
    let offset = 0;
    let busy = false;
    const publish = async (): Promise<void> => {
      if (busy) return;
      busy = true;
      try {
        if (marine) {
          const { latitude, longitude, timestamp, source, ...values } = marine;
          const ageMs = Math.round(Date.now() - timestamp);
          if (ageMs >= 0 && ageMs <= 3_600_000) await api.publishShared('MARINE_DATA', { lat: latitude, lon: longitude, ageMs, source, values });
        }
        if (weather) {
          const ageMs = Date.now() - weather.timestamp;
          if (ageMs >= 0 && ageMs <= 3_600_000) await api.publishShared('WEATHER_DATA', {
            lat: weather.latitude, lon: weather.longitude, ageMs: Math.round(ageMs), source: weather.source,
            windSpeed: weather.tws, windDirection: weather.twd, temperature: weather.temperature, pressure: weather.pressure
          });
        }
        const plans = shipId ? loadMissionPlans(localStorage, shipId).filter(p => !p.id.startsWith('link-') && p.waypoints.length > 0) : [];
        // Bound traffic and rotate through all revisions on subsequent ticks.
        for (let i = 0; i < Math.min(10, plans.length); i++) {
          const p = plans[(offset + i) % plans.length];
          const key = `${p.id}-${p.version}`;
          if (!/^[A-Za-z0-9-]{1,100}$/.test(key)) continue;
          const route: SharedRoute = { key, name: p.name.slice(0, 200), waypoints: p.waypoints.map(w => ({ name: w.name.slice(0, 200), lat: w.lat, lon: w.lng })) };
          await api.publishShared('ROUTE_DATA', route);
        }
        offset = plans.length ? (offset + 10) % plans.length : 0;
      } catch (error: unknown) { reportSharedLinkError(error); }
      finally { busy = false; }
    };
    void publish();
    const timer = window.setInterval(() => { void publish(); }, 15_000);
    return () => { off(); window.clearInterval(timer); };
  }, [shipId, weather, marine]);
}

export function useSharedLinkAis(targets: readonly AisPanelTarget[]): void {
  // App refreshes target freshness once a second. Limit traffic to one batch per ten seconds.
  useEffect(() => {
    const api = window.gaulosLink;
    if (!api) return;
    const now = Date.now();
    if (now - lastAisPublish < 10_000) return;
    lastAisPublish = now;
    const shared = targets.flatMap(t => {
      const lon = t.lng ?? t.lon;
      const mmsi = String(t.mmsi ?? '');
      if (!/^[0-9]{9}$/.test(mmsi) || typeof t.timestamp !== 'number' || !Number.isFinite(t.timestamp) || now < t.timestamp || now - t.timestamp >= 120_000
        || !Number.isFinite(t.lat) || Math.abs(t.lat) > 90 || typeof lon !== 'number' || !Number.isFinite(lon) || Math.abs(lon) > 180 || (t.lat === 0 && lon === 0)
        || typeof t.sog !== 'number' || !Number.isFinite(t.sog) || t.sog < 0 || t.sog > 102.2 || typeof t.cog !== 'number' || !Number.isFinite(t.cog) || t.cog < 0 || t.cog >= 360) return [];
      return [{ mmsi, name: (t.shipName ?? t.vesselName ?? t.name ?? '').slice(0, 200), lat: t.lat, lon,
        sog: t.sog, cog: t.cog, ageMs: Math.round(now - t.timestamp) }];
    });
    // Rotate large fleets, preserving the observation age in every batch.
    const batch = shared.length ? Array.from({ length: Math.min(200, shared.length) }, (_, i) => shared[(aisOffset + i) % shared.length]) : [];
    aisOffset = shared.length ? (aisOffset + 200) % shared.length : 0;
    void api.publishShared('AIS_DATA', { targets: batch }).catch(reportSharedLinkError);
  }, [targets]);
}
let lastAisPublish = 0;
let aisOffset = 0;
