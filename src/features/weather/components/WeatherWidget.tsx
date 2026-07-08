import React from 'react';
import { Wind, Thermometer, Cloud } from 'lucide-react';

interface WeatherWidgetProps {
  weather: any;
  className?: string;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ weather, className }) => {
  return (
    <div
  className={`absolute top-24 left-6 z-[1000] w-[90px] h-[45px] bg-[#070b14]/75 backdrop-blur-xl border border-white/10 rounded-2xl p-1 shadow-2xl pointer-events-auto flex items-center justify-center ${className || ''}`}
>
          <div className="flex items-center gap-1"> {/* Combined into a single flex row */}
        <Cloud size={8} className="text-slate-600 flex-shrink-0" /> {/* Smaller icon */}
        <span className="text-[9px] font-mono font-black text-white">{weather.temp}°</span> {/* Smaller text */}
        
        <Wind size={10} className="text-cyan-400 ml-1" /> {/* Smaller icon, slight margin */}
        <span className="text-[9px] font-mono font-black text-white">{weather.wind.toFixed(0)}<span className="text-[6px] text-slate-500 ml-0.5 uppercase font-bold">kt</span></span> {/* Smaller text */}
        <div className="w-2 h-2 flex items-center justify-center text-cyan-400" style={{ transform: `rotate(${weather.windDir}deg)` }}>
          <div className="w-0 h-0 border-l-[2px] border-r-[2px] border-b-[4px] border-l-transparent border-r-transparent border-b-current" />
        </div>
      </div>
    </div>
  );
};