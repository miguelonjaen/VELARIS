import React from 'react';
import { Polyline } from 'react-leaflet';
import { ProcessedWeather } from '@/shared/types';
import { WeatherWidget } from './features/weather/components/WeatherWidget';

interface WeatherLayerProps {
  weather: ProcessedWeather | null;
  plannedPath: [number, number][];
}

export const WeatherLayer: React.FC<WeatherLayerProps> = ({ weather, plannedPath }) => {
  return (
    <>
      {weather && <WeatherWidget weather={weather} />}
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