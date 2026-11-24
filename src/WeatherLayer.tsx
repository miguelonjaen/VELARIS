import type { WindObservation } from './core/instruments/resolveWind';
import React from 'react';
import { Polyline } from 'react-leaflet';
import { WeatherData } from '@/lib/useWeather';
import { MarineWeatherData } from '@/lib/useMarineWeather';
import { WeatherWidget } from './features/weather/components/WeatherWidget';

interface WeatherLayerProps {
  showWidget?: boolean;
  weather: WeatherData | null;
  windObservation?: WindObservation;
  marineWeather?: MarineWeatherData | null;
  isLoading?: boolean;
  error?: string | null;
  plannedPath: [number, number][];
}

export const WeatherLayer: React.FC<WeatherLayerProps> = ({ showWidget = true, weather, windObservation, marineWeather, isLoading = false, error, plannedPath }) => {
  return (
    <>
      {showWidget && <WeatherWidget windObservation={windObservation} weather={weather} marineWeather={marineWeather} isLoading={isLoading} error={error} />}
      {plannedPath && plannedPath.length >= 2 && (
        <Polyline 
          positions={plannedPath} 
          color="#00e5ff" 
          weight={5} 
          opacity={0.86} 
        />
      )}
    </>
  );
};
