
import { useCallback, useEffect, useRef, useState } from 'react';

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const MIN_DISTANCE_KM = 10;
const KILOMETRES_PER_HOUR_TO_KNOTS = 0.539957;

export interface MarineWeatherData {
  latitude: number;
  longitude: number;
  waveHeight: number | null;
  waveDirection: number | null;
  wavePeriod: number | null;
  swellWaveHeight: number | null;
  swellWaveDirection: number | null;
  swellWavePeriod: number | null;
  secondarySwellWaveHeight: number | null;
  secondarySwellWaveDirection: number | null;
  secondarySwellWavePeriod: number | null;
  currentSpeed: number | null;
  currentDirection: number | null;
  seaLevelHeight: number | null;
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
  current_units?: {
    ocean_current_velocity?: string;
  };
}

interface UseMarineWeatherResult {
  marineWeather: MarineWeatherData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const MARINE_CURRENT_VARIABLES = [
  'wave_height',
  'wave_direction',
  'wave_period',
  'swell_wave_height',
  'swell_wave_direction',
  'swell_wave_period',
  'secondary_swell_wave_height',
  'secondary_swell_wave_direction',
  'secondary_swell_wave_period',
  'ocean_current_velocity',
  'ocean_current_direction',
  'sea_level_height_msl',
  'sea_surface_temperature'
] as const;

const numberOrNull = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : null;

const speedToKnots = (
  speed: number | undefined,
  unit: string | undefined
): number | null => {
  const value = numberOrNull(speed);

  if (value === null) return null;
  if (unit === 'km/h') return Number((value * KILOMETRES_PER_HOUR_TO_KNOTS).toFixed(2));
  if (unit === 'm/s') return Number((value * 1.943844).toFixed(2));
  if (unit === 'kn') return value;

  return null;
};

const distanceKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(dLon / 2) ** 2;

  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
};

const validPosition = (
  lat: number | null,
  lon: number | null
): lat is number =>
  lat !== null &&
  lon !== null &&
  Number.isFinite(lat) &&
  Number.isFinite(lon) &&
  lat >= -90 &&
  lat <= 90 &&
  lon >= -180 &&
  lon <= 180 &&
  !(lat === 0 && lon === 0);

export const useMarineWeather = (
  latitude: number | null,
  longitude: number | null
): UseMarineWeatherResult => {
  const [marineWeather, setMarineWeather] =
    useState<MarineWeatherData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const positionRef = useRef({ latitude, longitude });
  positionRef.current = { latitude, longitude };

  const lastSuccessRef = useRef<{
    latitude: number;
    longitude: number;
    timestamp: number;
  } | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);

  const fetchMarineWeather = useCallback(
    async (force = false): Promise<void> => {
      const { latitude: lat, longitude: lon } = positionRef.current;

      if (!validPosition(lat, lon) || lon === null) {
        controllerRef.current?.abort();
        controllerRef.current = null;
        requestIdRef.current++;
        lastSuccessRef.current = null;
        setMarineWeather(null);
        setIsLoading(false);
        setError(null);
        return;
      }

      const last = lastSuccessRef.current;
      const now = Date.now();

      if (
        !force &&
        last &&
        now - last.timestamp < REFRESH_INTERVAL_MS &&
        distanceKm(last.latitude, last.longitude, lat, lon) < MIN_DISTANCE_KM
      ) {
        return;
      }

      if (controllerRef.current) {
        if (!force) return;
        controllerRef.current.abort();
      }

      const controller = new AbortController();
      controllerRef.current = controller;
      const requestId = ++requestIdRef.current;

      setIsLoading(true);
      setError(null);

      try {
        const url = new URL('https://marine-api.open-meteo.com/v1/marine');

        url.search = new URLSearchParams({
          latitude: lat.toString(),
          longitude: lon.toString(),
          current: MARINE_CURRENT_VARIABLES.join(','),
          cell_selection: 'sea',
          forecast_days: '1'
        }).toString();

        const response = await fetch(url, {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Error meteorológico marino: HTTP ${response.status}`);
        }

        const data: MarineApiResponse = await response.json();
        const current = data.current;

        if (!current) {
          throw new Error('Open-Meteo Marine no devolvió condiciones actuales');
        }

        if (!mountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        const normalized: MarineWeatherData = {
          latitude: lat,
          longitude: lon,
          waveHeight: numberOrNull(current.wave_height),
          waveDirection: numberOrNull(current.wave_direction),
          wavePeriod: numberOrNull(current.wave_period),
          swellWaveHeight: numberOrNull(current.swell_wave_height),
          swellWaveDirection: numberOrNull(current.swell_wave_direction),
          swellWavePeriod: numberOrNull(current.swell_wave_period),
          secondarySwellWaveHeight: numberOrNull(current.secondary_swell_wave_height),
          secondarySwellWaveDirection: numberOrNull(current.secondary_swell_wave_direction),
          secondarySwellWavePeriod: numberOrNull(current.secondary_swell_wave_period),
          currentSpeed: speedToKnots(
            current.ocean_current_velocity,
            data.current_units?.ocean_current_velocity
          ),
          currentDirection: numberOrNull(current.ocean_current_direction),
          seaLevelHeight: numberOrNull(current.sea_level_height_msl),
          seaSurfaceTemperature: numberOrNull(current.sea_surface_temperature),
          timestamp: Date.now(),
          source: 'open-meteo-marine'
        };

        lastSuccessRef.current = {
          latitude: lat,
          longitude: lon,
          timestamp: normalized.timestamp
        };

        setMarineWeather(normalized);
      } catch (caughtError: unknown) {
        if (controller.signal.aborted) return;
        if (!mountedRef.current || requestId !== requestIdRef.current) return;

        const message =
          caughtError instanceof Error
            ? caughtError.message
            : 'Error al obtener datos marinos';

        console.error('[GAULOS MARINE WEATHER ERROR]', caughtError);
        setError(message);
      } finally {
        if (requestId === requestIdRef.current) {
          controllerRef.current = null;

          if (mountedRef.current) {
            setIsLoading(false);
          }
        }
      }
    },
    []
  );

  useEffect(() => {
    mountedRef.current = true;
    void fetchMarineWeather();

    const interval = window.setInterval(() => {
      void fetchMarineWeather();
    }, 60_000);

    return () => {
      mountedRef.current = false;
      requestIdRef.current++;
      controllerRef.current?.abort();
      controllerRef.current = null;
      window.clearInterval(interval);
    };
  }, [fetchMarineWeather]);

  useEffect(() => {
    if (
      !validPosition(latitude, longitude) ||
      longitude === null
    ) {
      void fetchMarineWeather();
      return;
    }

    const last = lastSuccessRef.current;

    if (
      !last ||
      distanceKm(
        last.latitude,
        last.longitude,
        latitude,
        longitude
      ) >= MIN_DISTANCE_KM
    ) {
      void fetchMarineWeather();
    }
  }, [latitude, longitude, fetchMarineWeather]);

  const refetch = useCallback(
    () => fetchMarineWeather(true),
    [fetchMarineWeather]
  );

  return {
    marineWeather,
    isLoading,
    error,
    refetch
  };
};
