import React from 'react';
import { Cloud, Thermometer, Droplets } from 'lucide-react';
import { ProcessedWeather } from '@shared/types';

export const WeatherPage = ({ weather }: { weather: ProcessedWeather }) => {
  return (
    <div className="w-full h-full bg-black flex flex-col p-6 items-center justify-center">
      <div className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-8">METEOROLOGÍA</div>
      
      <div className="grid grid-cols-2 gap-x-12 gap-y-10 w-full max-w-[280px]">
          <div className="flex flex-col items-center">
              <Thermometer size={14} className="text-amber-500 mb-2" />
              <span className="text-[7px] font-black text-slate-600 uppercase">TEMP</span>
              <span className="text-2xl font-black text-white font-mono">{weather?.temp || 22}°</span>
          </div>
          <div className="flex flex-col items-center">
              <Droplets size={14} className="text-blue-500 mb-2" />
              <span className="text-[7px] font-black text-slate-600 uppercase">HUMEDAD</span>
              <span className="text-2xl font-black text-white font-mono">{weather?.humidity || 65}%</span>
          </div>
          <div className="flex flex-col items-center text-center">
              <span className="text-blue-400 mb-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M2 18s3-2 10-2 10 2 10 2"/><path d="M2 12s3-2 10-2 10 2 10 2"/><path d="M2 6s3-2 10-2 10 2 10 2"/></svg>
              </span>
              <span className="text-[7px] font-black text-slate-600 uppercase">OLA</span>
              <span className="text-xl font-black text-white font-mono">{weather?.waveHeight || '0.0'} <span className="text-[8px]">m</span></span>
          </div>
          <div className="flex flex-col items-center text-center">
              <span className="text-emerald-400 mb-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="m17 7-5-5-5 5"/><path d="m17 17-5 5-5-5"/></svg>
              </span>
              <span className="text-[7px] font-black text-slate-600 uppercase">MAREA</span>
              <span className="text-xl font-black text-white font-mono">{weather?.tideLevel || '0.0'} <span className="text-[8px]">m</span></span>
          </div>
          <div className="flex flex-col items-center">
              <Cloud size={14} className="text-slate-400 mb-2" />
              <span className="text-[7px] font-black text-slate-600 uppercase">PRESIÓN</span>
              <span className="text-xl font-black text-white font-mono leading-none mt-1">{weather?.pressure || 1013} <span className="text-[8px] text-slate-500">hPa</span></span>
          </div>
          <div className="flex flex-col items-center">
              <div className="w-4 h-4 bg-emerald-500/20 rounded flex items-center justify-center mb-2 border border-emerald-500/30">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              </div>
              <span className="text-[7px] font-black text-slate-600 uppercase">ESTADO</span>
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-tighter text-center mt-1">ESTABLE</span>
          </div>
      </div>

      <div className="mt-12 w-full px-2">
          <div className="text-[7px] font-black text-slate-600 uppercase mb-2">HISTORIAL BAROMÉTRICO (24H)</div>
          <div className="w-full h-1 bg-slate-900 rounded-full relative">
              <div className="absolute inset-y-0 left-1/4 right-0 bg-blue-500 opacity-20 rounded-full" />
              <div className="absolute top-1/2 left-3/4 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
          </div>
      </div>
    </div>
  );
};