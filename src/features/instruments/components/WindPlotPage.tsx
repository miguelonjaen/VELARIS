import React from 'react';

export const WindPlotPage = ({ tws, twa }: any) => {
  // Simulate some history data
  const history = Array.from({ length: 20 }, (_, i) => ({
    x: i * 10,
    y: 20 + Math.sin(i * 0.5) * 10 + Math.random() * 5
  }));

  return (
    <div className="w-full h-full bg-black flex flex-col p-4">
      <div className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4 text-center">GRÁFICO DE VIENTO</div>
      
      <div className="flex-grow relative border border-white/5 bg-slate-950/50 rounded p-2">
        <svg viewBox="0 0 200 100" className="w-full h-full" preserveAspectRatio="none">
            {/* Grid Line */}
            <line x1="0" y1="50" x2="200" y2="50" stroke="white" strokeOpacity="0.1" strokeDasharray="4,4" />
            
            {/* Plot */}
            <polyline
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2"
              points={history.map(p => `${p.x},${100 - p.y}`).join(' ')}
            />
        </svg>
        <div className="absolute top-2 right-2 flex flex-col items-end">
            <span className="text-[7px] font-black text-slate-600 uppercase">TIEMPO (10M)</span>
            <span className="text-xl font-black text-white font-mono">{tws.toFixed(1)} <span className="text-[8px] text-slate-500">KT</span></span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="flex flex-col border-r border-white/10 pr-4">
              <span className="text-[7px] font-black text-slate-600 uppercase">TWA</span>
              <span className="text-lg font-black text-white font-mono">{Math.round(twa)}°</span>
          </div>
          <div className="flex flex-col pl-4 text-right">
              <span className="text-[7px] font-black text-slate-600 uppercase">VMG</span>
              <span className="text-lg font-black text-white font-mono">{(tws * Math.cos(twa * Math.PI / 180)).toFixed(1)}</span>
          </div>
      </div>
    </div>
  );
};
