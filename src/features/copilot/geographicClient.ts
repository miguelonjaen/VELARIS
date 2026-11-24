import type { GeographicKind, GeographicResolution } from '../../shared/geographicReference';
import type { RoutePlace } from './routePlaces';
import { resolveRoutePlace } from './routePlaces';
export async function resolveGeographicPlace(name: string, kind: GeographicKind = 'PLACE', endpoint?: string): Promise<GeographicResolution> {
  try {
    const place = resolveRoutePlace(name);
    if (kind === 'PLACE' || kind === 'PORT') return {query:name,status:'RESOLVED',candidates:[place],cache:'FRESH',message:'Referencia publicada local; acceso no planificado.'};
  } catch { /* Open-world search is the normal fallback, not a catalogue error. */ }
  const base = (import.meta.env.VITE_LOCAL_API_URL || 'http://127.0.0.1:8089').replace(/\/$/,'');
  const response = await fetch(endpoint ?? `${base}/api/geographic-resolve`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:name,kind,offline:typeof navigator !== 'undefined' && navigator.onLine === false}),signal:AbortSignal.timeout(60000)
  });
  if (!response.ok) throw new Error(`GEOGRAPHY_HTTP_${response.status}`);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('status' in data) || !['RESOLVED','AMBIGUOUS','NOT_FOUND','UNAVAILABLE'].includes(String(data.status)) ||
    !('candidates' in data) || !Array.isArray(data.candidates) || data.candidates.length > 8 || !('message' in data) || typeof data.message !== 'string' ||
    !('cache' in data) || !['FRESH','STALE','MISS'].includes(String(data.cache)) || !data.candidates.every((p: unknown)=>{
      if (!p || typeof p !== 'object') return false;
      const c = p as Partial<RoutePlace>;
      return typeof c.name === 'string' && Array.isArray(c.position) && c.position.length === 2 && c.position.every(Number.isFinite) &&
        Math.abs(c.position[0]) <= 180 && Math.abs(c.position[1]) <= 90 && c.datum === 'WGS84' && c.navigationUse === false &&
        typeof c.source === 'string' && /^https:\/\//.test(c.source) && typeof c.reference === 'string' && typeof c.verifiedOn === 'string';
    }) || data.status === 'RESOLVED' && data.candidates.length !== 1) throw new Error('GEOGRAPHY_INVALID_RESPONSE');
  return data as GeographicResolution;
}
