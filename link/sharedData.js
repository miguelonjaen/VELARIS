// @ts-check
'use strict';
// Wire units: knots, degrees true FROM, degrees Celsius, hPa; WGS84 degrees.
const number = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const text = (v, max) => typeof v === 'string' && v.length <= max;
function validateSharedData(type, p) {
  const bad = () => ({ ok: false, code: 'BAD_SHARED_DATA', detail: 'Datos compartidos inválidos' });
  if (!p || typeof p !== 'object' || Array.isArray(p)) return bad();
  if (type === 'MARINE_DATA') {
    if (!number(p.lat, -90, 90) || !number(p.lon, -180, 180) || !Number.isInteger(p.ageMs)
      || !number(p.ageMs, 0, 3600000) || p.source !== 'open-meteo-marine' || !p.values || typeof p.values !== 'object' || Array.isArray(p.values)) return bad();
    const ranges = { waveHeight: [0, 50], waveDirection: [0, 360], wavePeriod: [0, 100],
      swellWaveHeight: [0, 50], swellWaveDirection: [0, 360], swellWavePeriod: [0, 100],
      secondarySwellWaveHeight: [0, 50], secondarySwellWaveDirection: [0, 360], secondarySwellWavePeriod: [0, 100],
      currentSpeed: [0, 50], currentDirection: [0, 360], seaLevelHeight: [-50, 50], seaSurfaceTemperature: [-5, 60] };
    if (Object.keys(p.values).some(key => !Object.hasOwn(ranges, key))) return bad();
    const values = {};
    for (const [key, [min, max]] of Object.entries(ranges)) {
      const value = p.values[key] ?? null;
      if (value !== null && !number(value, min, max)) return bad();
      values[key] = value;
    }
    return { ok: true, value: { lat: p.lat, lon: p.lon, ageMs: p.ageMs, source: p.source, values } };
  }
  if (type === 'AIS_DATA') {
    if (!Array.isArray(p.targets) || p.targets.length > 200) return bad();
    if (!p.targets.every(t => t && /^[0-9]{9}$/.test(t.mmsi) && text(t.name, 200)
      && number(t.lat, -90, 90) && number(t.lon, -180, 180) && !(t.lat === 0 && t.lon === 0)
      && number(t.sog, 0, 102.2) && number(t.cog, 0, 359.999999)
      && Number.isInteger(t.ageMs) && number(t.ageMs, 0, 119999))) return bad();
    return { ok: true, value: { targets: p.targets.map(t => ({ mmsi: t.mmsi, name: t.name,
      lat: t.lat, lon: t.lon, sog: t.sog, cog: t.cog, ageMs: t.ageMs })) } };
  }
  if (type === 'WEATHER_DATA') {
    if (!number(p.lat, -90, 90) || !number(p.lon, -180, 180) || !number(p.ageMs, 0, 3600000) || !Number.isInteger(p.ageMs)
      || !number(p.windSpeed, 0, 250) || !number(p.windDirection, 0, 360)
      || !number(p.temperature, -100, 70) || !number(p.pressure, 800, 1200) || p.source !== 'openweather') return bad();
    return { ok: true, value: { lat: p.lat, lon: p.lon, ageMs: p.ageMs, windSpeed: p.windSpeed,
      windDirection: p.windDirection, temperature: p.temperature, pressure: p.pressure, source: p.source } };
  }
  if (type === 'ROUTE_DATA') {
    if (!text(p.key, 100) || !/^[A-Za-z0-9-]{1,100}$/.test(p.key) || !text(p.name, 200)
      || !Array.isArray(p.waypoints) || p.waypoints.length < 1 || p.waypoints.length > 500) return bad();
    if (!p.waypoints.every(w => w && text(w.name, 200) && number(w.lat, -90, 90) && number(w.lon, -180, 180))) return bad();
    return { ok: true, value: { key: p.key, name: p.name, waypoints: p.waypoints.map(w => ({ name: w.name, lat: w.lat, lon: w.lon })) } };
  }
  return bad();
}
module.exports = { validateSharedData };
