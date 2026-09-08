import React from 'react';
import { Polyline } from 'react-leaflet';
import { WeatherData } from '@/lib/useWeather';
import { MarineWeatherData } from '@/lib/useMarineWeather';
import { WeatherWidget } from './features/weather/components/WeatherWidget';

interface WeatherLayerProps {
  weather: WeatherData | null;
  marineWeather?: MarineWeatherData | null;
  isLoading?: boolean;
  plannedPath: [number, number][];
}

export const WeatherLayer: React.FC<WeatherLayerProps> = ({ weather, marineWeather, isLoading = false, plannedPath }) => {
  return (
    <>
      <WeatherWidget weather={weather} marineWeather={marineWeather} isLoading={isLoading} />
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
