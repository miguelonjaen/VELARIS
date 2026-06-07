import React from 'react';

export const GPSPage = ({ sog, cog }: any) => {
  return (
    <div className="w-full h-full bg-black flex flex-col p-6 items-center justify-center">
      <div className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-10">GPS</div>
      
      <div className="space-y-10 w-full max-w-[240px]">
          <div className="flex justify-between items-center border-b border-white/5 pb-4">
              <div className="flex flex-col">
                  <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest">SOG kt</span>
                  <span className="text-4xl font-black text-white font-mono leading-none tracking-tighter">{sog.toFixed(1)}</span>
              </div>
              <div className="flex flex-col items-end">
                  <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest">COG</span>
                  <span className="text-4xl font-black text-white font-mono leading-none tracking-tighter">{Math.round(cog).toString().padStart(3, '0')}°</span>
              </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
              <div className="flex flex-col">
                  <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest leading-none mb-2">POSICIÓN</span>
                  <div className="bg-slate-950 p-4 rounded border border-white/10 shadow-inner">
                      <div className="text-xl font-black text-white font-mono leading-none tracking-tighter mb-2">36° 43.120' N</div>
                      <div className="text-xl font-black text-white font-mono leading-none tracking-tighter">03° 31.425' W</div>
                  </div>
              </div>
          </div>
      </div>

      <div className="absolute bottom-6 flex gap-4 opacity-40">
          <span className="text-[7px] font-black text-white uppercase tracking-widest">WGS84</span>
          <span className="text-[7px] font-black text-white uppercase tracking-widest">3D FIX (8 SAT)</span>
      </div>
    </div>
  );
};
