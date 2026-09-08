import { useCallback, useEffect, useState } from 'react';

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const KILOMETRES_PER_HOUR_TO_KNOTS = 0.539957;

export interface MarineWeatherData {
  waveHeight: number | null;
  /** Direction FROM which waves arrive, per Open-Meteo Marine. */
  waveDirection: number | null;
  wavePeriod: number | null;
  swellWaveHeight: number | null;
  /** Direction FROM which swell arrives, per Open-Meteo Marine. */
  swellWaveDirection: number | null;
  swellWavePeriod: number | null;
  secondarySwellWaveHeight: number | null;
  /** Direction FROM which secondary swell arrives, per Open-Meteo Marine. */
  secondarySwellWaveDirection: number | null;
  secondarySwellWavePeriod: number | null;
  /** Current speed in knots. */
  currentSpeed: number | null;
  /** Direction TOWARD which the current flows, per Open-Meteo Marine. */
  currentDirection: number | null;
  /** Sea-level height above global mean sea level, in metres. */
  seaLevelHeight: number | null;
  /** Sea-surface temperature in degrees Celsius. */
  seaSurfaceTemperature: number | null;
  timestamp: number;
  source: 'open-meteo-marine';
}

interface MarineApiCurrent {
  time?: string;
  wave_height?: number;
  wave_direction?: number;
  wave_period?: number;
  swell_wave_height?: number;
  swell_wave_direction?: number;
  swell_wave_period?: number;
  secondary_swell_wave_height?: number;
  secondary_swell_wave_direction?: number;
  secondary_swell_wave_period?: number;
  ocean_current_velocity?: number;
  ocean_current_direction?: number;
  sea_level_height_msl?: number;
  sea_surface_temperature?: number;
}

interface MarineApiResponse {
  current?: MarineApiCurrent;
  current_units?: { ocean_current_velocity?: string };
}

interface UseMarineWeatherResult {
  marineWeather: MarineWeatherData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const numberOrNull = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const speedToKnots = (speed: number | undefined, unit: string | undefined): number | null => {
  const value = numberOrNull(speed);
  if (value === null) return null;
  if (unit === 'km/h') return Number((value * KILOMETRES_PER_HOUR_TO_KNOTS).toFixed(2));
  if (unit === 'm/s') return Number((value * 1.943844).toFixed(2));
  if (unit === 'kn') return value;
  return null;
};

const MARINE_CURRENT_VARIABLES = [
  'wave_height', 'wave_direction', 'wave_period',
  'swell_wave_height', 'swell_wave_direction', 'swell_wave_period',
  'secondary_swell_wave_height', 'secondary_swell_wave_direction', 'secondary_swell_wave_period',
  'ocean_current_velocity', 'ocean_current_direction',
  'sea_level_height_msl', 'sea_surface_temperature'
] as const;

/** Fetches one modeled Open-Meteo Marine current-condition observation per active position. */
export const useMarineWeather = (latitude: number | null, longitude: number | null): UseMarineWeatherResult => {
  const [marineWeather, setMarineWeather] = useState<MarineWeatherData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMarineWeather = useCallback(async (): Promise<void> => {
    if (latitude === null || longitude === null) {
      setMarineWeather(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const url = new URL('https://marine-api.open-meteo.com/v1/marine');
      url.search = new URLSearchParams({
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        current: MARINE_CURRENT_VARIABLES.join(','),
        cell_selection: 'sea',
        forecast_days: '1'
      }).toString();

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Error meteorológico marino: ${response.statusText}`);
      const data: MarineApiResponse = await response.json();
      const current = data.current;
      if (!current) throw new Error('Open-Meteo Marine no devolvió condiciones actuales');

      const normalizedMarineWeather: MarineWeatherData = {
        waveHeight: numberOrNull(current.wave_height),
        waveDirection: numberOrNull(current.wave_direction),
        wavePeriod: numberOrNull(current.wave_period),
        swellWaveHeight: numberOrNull(current.swell_wave_height),
        swellWaveDirection: numberOrNull(current.swell_wave_direction),
        swellWavePeriod: numberOrNull(current.swell_wave_period),
        secondarySwellWaveHeight: numberOrNull(current.secondary_swell_wave_height),
        secondarySwellWaveDirection: numberOrNull(current.secondary_swell_wave_direction),
        secondarySwellWavePeriod: numberOrNull(current.secondary_swell_wave_period),
        currentSpeed: speedToKnots(current.ocean_current_velocity, data.current_units?.ocean_current_velocity),
        currentDirection: numberOrNull(current.ocean_current_direction),
        seaLevelHeight: numberOrNull(current.sea_level_height_msl),
        seaSurfaceTemperature: numberOrNull(current.sea_surface_temperature),
        timestamp: Date.now(),
        source: 'open-meteo-marine'
      };

      setMarineWeather(normalizedMarineWeather);
      console.log('[VELARIS MARINE WEATHER]', {
        latitude,
        longitude,
        ...normalizedMarineWeather
      });
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Error al obtener datos marinos';
      console.error('[VELARIS MARINE WEATHER ERROR]', caughtError);
      setMarineWeather(null);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [latitude, longitude]);

  useEffect(() => { void fetchMarineWeather(); }, [fetchMarineWeather]);
  useEffect(() => {
    const interval = window.setInterval(() => { void fetchMarineWeather(); }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchMarineWeather]);

  return { marineWeather, isLoading, error, refetch: fetchMarineWeather };
};
