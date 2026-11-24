import { fetchWeatherProxy, WeatherProxyError } from '../../../lib/weatherProxy';
import { fromMeteorological, type WindBounds, type WindField, type WindFrame, type WindVector } from './windField';
import type { WindForecastProvider, WindRequest } from './openMeteoWind';

const TTL = 30 * 60 * 1000;
const MINUTE = 60 * 1000;
export const OPENWEATHER_WIND_CALL_LIMIT = 24;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
interface PointForecast { readonly samples: ReadonlyMap<number, WindVector | null>; readonly fetchedAt: number }

/** Query coordinates, not native model cells. At most 3 × 3 point forecasts per viewport. */
export function openWeatherWindRequest(bounds: WindBounds): WindRequest {
  const {south,north,west,east}=bounds;
  if(![south,north,west,east].every(Number.isFinite) || south < -80 || north > 80 || south>=north || west < -180 || east > 180 || west>=east || north-south>16 || east-west>16)
    throw new Error('Sin cobertura: acerque la carta (máximo 16°, sin polos ni cruce de antimeridiano)');
  const axis=(min:number,max:number,limit:number)=>{
    let step=.25;
    while(Math.ceil(max/step)-Math.floor(min/step)>2)step*=2;
    const start=Math.floor(min/step),end=Math.ceil(max/step);
    return [...new Set(Array.from({length:end-start+1},(_,i)=>Math.max(-limit,Math.min(limit,(start+i)*step))))];
  };
  const latitudes=axis(south,north,85),longitudes=axis(west,east,180);
  return {latitudes,longitudes,key:`openweather:${latitudes.join(',')}/${longitudes.join(',')}`};
}
export function parseOpenWeatherPoint(raw: unknown, fetchedAt: number): PointForecast {
  const payload=record(raw);
  if(!payload || !Array.isArray(payload.list) || payload.list.length>40)throw new Error('OpenWeather: respuesta de pronóstico inválida');
  const samples=new Map<number,WindVector|null>();
  for(const rawItem of payload.list){
    const item=record(rawItem);
    if(!item || !finite(item.dt) || item.dt<=0 || samples.has(item.dt*1000))throw new Error('OpenWeather: eje temporal inválido');
    const wind=record(item.wind),speed=wind?.speed,direction=wind?.deg;
    const vector=finite(speed) && speed>=0 && speed<=200 && (speed===0 || finite(direction) && direction>=0 && direction<=360)
      ? speed===0 ? {u:0,v:0} : fromMeteorological(speed,direction as number) : null;
    samples.set(item.dt*1000,vector);
  }
  if(!samples.size)throw new Error('OpenWeather: sin pasos de pronóstico');
  return {samples,fetchedAt};
}
export function assembleOpenWeatherWind(points: readonly PointForecast[], request: WindRequest, now: number): WindField {
  const width=request.longitudes.length;
  if(width<2 || request.latitudes.length<2 || points.length!==width*request.latitudes.length)throw new Error('OpenWeather: muestreo incompleto');
  const frames:WindFrame[]=[];
  for(const time of [...points[0].samples.keys()].sort((a,b)=>a-b)){
    if(time < now-3*60*MINUTE || points.some(point=>!point.samples.has(time)))continue;
    const u=new Float32Array(points.length).fill(NaN),v=new Float32Array(points.length).fill(NaN);
    points.forEach((point,i)=>{const vector=point.samples.get(time);if(vector){u[i]=vector.u;v[i]=vector.v;}});
    const usable=request.latitudes.slice(0,-1).some((_,row)=>request.longitudes.slice(0,-1).some((__,col)=>[row*width+col,row*width+col+1,(row+1)*width+col,(row+1)*width+col+1].every(i=>finite(u[i])&&finite(v[i]))));
    if(usable)frames.push({time,u,v});
  }
  if(!frames.length)throw new Error('OpenWeather: sin pasos comunes con viento válido');
  return {latitudes:[...request.latitudes],longitudes:[...request.longitudes],frames,fetchedAt:Math.min(...points.map(p=>p.fetchedAt)),source:'OpenWeather',model:'OpenWeather · Pronóstico de 5 días / 3 h'};
}
interface ProviderOptions {
  getApiKey?: () => string | undefined;
  fetcher?: typeof fetch;
  now?: () => number;
  fetchPoint?: (
    lat: number,
    lon: number,
    signal: AbortSignal
  ) => Promise<unknown>;
}
/** Bounded point cache and budget; HTTP/auth errors never include the request URL or credentials. */
export function createOpenWeatherWindProvider(options:ProviderOptions):WindForecastProvider {
  const cache=new Map<string,PointForecast>();
  const now=options.now ?? Date.now;
  let calls:number[]=[],blockedUntil=0,lastKey:string|undefined;
  return {async load(request,signal){
    signal.throwIfAborted();
    const apiKey=options.getApiKey?.()?.trim();
    if(!options.fetchPoint && !apiKey)
      throw new Error('OpenWeather: falta la clave configurada para meteorología');
    if(apiKey!==lastKey){
      cache.clear();
      calls=[];
      blockedUntil=0;
      lastKey=apiKey;
    }
    if(request.latitudes.length<2 || request.longitudes.length<2 || request.latitudes.length>3 || request.longitudes.length>3 || request.latitudes.some((n,i,a)=>!finite(n)||Math.abs(n)>85||i>0&&n<=a[i-1]) || request.longitudes.some((n,i,a)=>!finite(n)||Math.abs(n)>180||i>0&&n<=a[i-1]))throw new Error('OpenWeather: máximo 9 puntos geográficos válidos');
    if(now()<blockedUntil)throw new Error('OpenWeather: pausa por cuota o acceso rechazado; reintente más tarde');
    const points:PointForecast[]=[];
    for(const lat of request.latitudes)for(const lon of request.longitudes){
      signal.throwIfAborted();
      const pointKey=`${lat}/${lon}`,cached=cache.get(pointKey),instant=now();
      if(cached && instant-cached.fetchedAt>=0 && instant-cached.fetchedAt<TTL){points.push(cached);continue;}
      calls=calls.filter(time=>instant-time<MINUTE);
      if(calls.length>=OPENWEATHER_WIND_CALL_LIMIT)throw new Error('WindFlow: límite local de 24 consultas/minuto; espere antes de mover la zona o reintentar');
      calls.push(instant);
      let raw: unknown;

      if (options.fetchPoint) {
        try {
          raw = await options.fetchPoint(lat, lon, signal);
        } catch (error) {
          if (signal.aborted) throw error;

          if (error instanceof WeatherProxyError) {
            if (error.status === 401 || error.status === 403) {
              blockedUntil = now() + MINUTE;
              throw new Error(
                'WindFlow: sesión no autorizada. Inicie sesión de nuevo.'
              );
            }

            if (error.status === 429) {
              blockedUntil = now() + MINUTE;
              throw new Error(
                'WindFlow: límite de consultas alcanzado. Espere antes de reintentar.'
              );
            }
          }

          throw new Error(
            'WindFlow: servicio meteorológico no disponible'
          );
        }
      } else {
        const url = new URL(
          'https://api.openweathermap.org/data/2.5/forecast'
        );

        url.search = new URLSearchParams({
          lat: String(lat),
          lon: String(lon),
          appid: apiKey ?? '',
          units: 'metric',
        }).toString();

        let response: Response;

        try {
          response = await (options.fetcher ?? fetch)(url, { signal });
        } catch (error) {
          if (signal.aborted) throw error;
          throw new Error(
            'OpenWeather: sin conexión con el servicio de pronóstico'
          );
        }

        signal.throwIfAborted();

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            blockedUntil = now() + MINUTE;
            throw new Error(
              `OpenWeather: clave rechazada o sin acceso al pronóstico (${response.status}). Revise su cuenta.`
            );
          }

          if (response.status === 429) {
            const wait = Number(response.headers.get('Retry-After'));

            blockedUntil = now() + Math.max(
              MINUTE,
              Math.min(
                60 * MINUTE,
                Number.isFinite(wait) && wait > 0
                  ? wait * 1000
                  : MINUTE
              )
            );

            throw new Error(
              'OpenWeather: cuota agotada (429). Se pausa el acceso; revise su plan o espere.'
            );
          }

          throw new Error(
            `OpenWeather: pronóstico no disponible (HTTP ${response.status})`
          );
        }

        try {
          raw = await response.json();
        } catch {
          throw new Error('OpenWeather: respuesta JSON inválida');
        }
      }

      signal.throwIfAborted();
      const point=parseOpenWeatherPoint(raw,now());
      if(cache.size>=64)cache.delete(cache.keys().next().value!);
      cache.set(pointKey,point);points.push(point);
    }
    return assembleOpenWeatherWind(points,request,now());
  }};
}
export const openWeatherWind = createOpenWeatherWindProvider({
  fetchPoint: (lat, lon, signal) =>
    fetchWeatherProxy<unknown>('forecast', lat, lon, signal),
});
