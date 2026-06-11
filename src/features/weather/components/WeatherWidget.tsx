import React from 'react';
import { Cloud, Sun, CloudRain, Wind } from 'lucide-react';
import { ProcessedWeather } from '@shared/types';

interface WeatherWidgetProps {
  weather: ProcessedWeather;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ weather }) => {
  const getIcon = (condition: string) => {
    switch (condition.toLowerCase()) {
      case 'clear': return <Sun className="w-4 h-4 text-yellow-400" />;
      case 'rain': return <CloudRain className="w-4 h-4 text-blue-400" />;
      default: return <Cloud className="w-4 h-4 text-gray-400" />;
    }
  };

  const windKnots = (weather.wind * 1.94384).toFixed(1);

  return (
    <div className="absolute top-6 left-6 z-[10000] bg-[#070b14]/80 backdrop-blur-xl px-3 py-2 rounded-xl border border-white/10 text-white shadow-lg flex items-center gap-2 font-mono">
      {getIcon(weather.condition)}
      <div>
        <div className="text-sm font-black">{weather.temp.toFixed(1)}°C</div>
        <div className="flex items-center gap-1 text-[10px] font-bold text-cyan-300">
          <Wind className="w-4 h-4" />
          {windKnots} kn
        </div>
      </div>
    </div>
  );
};