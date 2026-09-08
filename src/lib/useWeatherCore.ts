import { useWeather, type WeatherData } from './useWeather';
import { useMarineWeather, type MarineWeatherData } from './useMarineWeather';

export interface WeatherCoreData {
  atmospheric: WeatherData | null;
  marine: MarineWeatherData | null;
}

export interface UseWeatherCoreResult {
  weatherCore: WeatherCoreData;
  isLoading: boolean;
  atmosphericError: string | null;
  marineError: string | null;
  refetch: () => Promise<void>;
}

/** Single application entry point for co-located atmospheric and modeled marine weather. */
export const useWeatherCore = (latitude: number | null, longitude: number | null): UseWeatherCoreResult => {
  const atmospheric = useWeather(latitude, longitude);
  const marine = useMarineWeather(latitude, longitude);

  return {
    weatherCore: { atmospheric: atmospheric.weather, marine: marine.marineWeather },
    isLoading: atmospheric.isLoading || marine.isLoading,
    atmosphericError: atmospheric.error,
    marineError: marine.error,
    refetch: async () => {
      await Promise.all([atmospheric.refetch(), marine.refetch()]);
    }
  };
};
