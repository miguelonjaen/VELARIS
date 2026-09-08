import { useCallback, useEffect, useState } from 'react';

const METERS_PER_SECOND_TO_KNOTS = 1.943844;
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export interface PrecipitationData {
  rain1hMm?: number;
  rain3hMm?: number;
  snow1hMm?: number;
  snow3hMm?: number;
}

/** OpenWeather normalized model. TWD is always wind FROM; legacy aliases remain. */
export interface WeatherData {
  temperature: number;
  condition: string;
  description: string;
  tws: number;
  twd: number;
  gust?: number;
  pressure: number;
  humidity: number;
  visibility?: number;
  cloudCover?: number;
  precipitation: PrecipitationData;
  timestamp: number;
  source: 'openweather';
  icon?: string;
  city?: string;
  seaState: string;
  waveHeight?: number;
  tideLevel?: number;
  temp: number;
  wind: number;
  windDir: number;
}

interface OpenWeatherResponse {
  main: { temp: number; pressure: number; humidity: number };
  wind: { speed: number; deg?: number; gust?: number };
  weather: Array<{ main: string; description: string; icon?: string }>;
  visibility?: number;
  clouds?: { all?: number };
  rain?: { '1h'?: number; '3h'?: number };
  snow?: { '1h'?: number; '3h'?: number };
  name?: string;
}

interface UseWeatherResult {
  weather: WeatherData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const toKnots = (metersPerSecond: number): number => Number((metersPerSecond * METERS_PER_SECOND_TO_KNOTS).toFixed(1));
const normalizeDegrees = (degrees: number | undefined): number => ((degrees ?? 0) % 360 + 360) % 360;
const seaStateFromTws = (tws: number): string => {
  if (tws < 1) return 'Calma';
  if (tws < 4) return 'Mar rizada';
  if (tws < 7) return 'Marejadilla';
  if (tws < 11) return 'Marejada';
  if (tws < 17) return 'Fuerte marejada';
  if (tws < 22) return 'Gruesa';
  if (tws < 28) return 'Muy gruesa';
  return 'Arbolada';
};

/** Returns the unsigned true-wind angle, 0–180°, from TWD (FROM) and heading. */
export const calculateTwa = (twd: number, heading: number): number => Math.abs(((twd - heading + 540) % 360) - 180);

export const useWeather = (lat: number | null, lng: number | null): UseWeatherResult => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(async (): Promise<void> => {
    if (lat === null || lng === null) {
      setWeather(null);
      return;
    }
    const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY ?? import.meta.env.VITE_OPENWEATHERMAP_API_KEY;
    if (!apiKey) {
      setWeather(null);
      setError('API Key de OpenWeather no configurada');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const url = new URL('https://api.openweathermap.org/data/2.5/weather');
      url.search = new URLSearchParams({ lat: lat.toString(), lon: lng.toString(), appid: apiKey, units: 'metric', lang: 'es' }).toString();
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Error meteorológico: ${response.statusText}`);
      const data: OpenWeatherResponse = await response.json();
      const currentCondition = data.weather[0];
      if (!currentCondition) throw new Error('OpenWeather no devolvió condición meteorológica');
      const tws = toKnots(data.wind.speed);
      const twd = normalizeDegrees(data.wind.deg);
      setWeather({
        temperature: data.main.temp, condition: currentCondition.main, description: currentCondition.description,
        tws, twd, gust: data.wind.gust === undefined ? undefined : toKnots(data.wind.gust),
        pressure: data.main.pressure, humidity: data.main.humidity, visibility: data.visibility, cloudCover: data.clouds?.all,
        precipitation: { rain1hMm: data.rain?.['1h'], rain3hMm: data.rain?.['3h'], snow1hMm: data.snow?.['1h'], snow3hMm: data.snow?.['3h'] },
        timestamp: Date.now(), source: 'openweather', icon: currentCondition.icon, city: data.name, seaState: seaStateFromTws(tws),
        temp: data.main.temp, wind: tws, windDir: twd
      });
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Error al obtener datos meteorológicos';
      console.error('Error fetching weather:', caughtError);
      setWeather(null);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [lat, lng]);

  useEffect(() => { void fetchWeather(); }, [fetchWeather]);
  useEffect(() => {
    const interval = window.setInterval(() => { void fetchWeather(); }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchWeather]);
  return { weather, isLoading, error, refetch: fetchWeather };
};
