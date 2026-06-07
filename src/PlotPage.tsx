import React from 'react';
import { cn } from '../../../lib/utils';

interface PlotProps {
    label: string;
    value: string;
    unit?: string;
    color: string;
}

const Plot = ({ label, value, unit, color }: PlotProps) => {
    // Fake trend data
    const history = Array.from({ length: 40 }, (_, i) => ({
        x: i * 5,
        y: 30 + Math.sin(i * 0.3) * 15 + Math.random() * 5
    }));

    return (
        <div className="flex-grow flex flex-col p-4 bg-black relative border-b border-white/5 last:border-b-0">
            <div className="flex justify-between items-start mb-2 z-10">
                <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
                <div className="text-xl font-black text-white font-mono leading-none tracking-tighter">
                    {value} <span className="text-[10px] text-slate-600 uppercase">{unit}</span>
                </div>
            </div>
            
            <div className="flex-grow relative mt-2 opacity-80 overflow-hidden rounded border border-white/5">
                <svg viewBox="0 0 200 60" className="w-full h-full" preserveAspectRatio="none">
                    <polyline
                        fill="none"
                        stroke={color}
                        strokeWidth="2"
                        strokeLinejoin="round"
                        points={history.map(p => `${p.x},${60 - p.y}`).join(' ')}
                    />
                </svg>
            </div>
        </div>
    );
};

export const PlotPage = ({ mode, data }: { mode: 'simple' | 'dual', data: PlotProps[] }) => {
  return (
    <div className="w-full h-full bg-black flex flex-col">
       <div className="bg-slate-900/50 p-2 border-b border-white/5 flex justify-center">
            <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.4em]">
                {mode === 'simple' ? 'GRÁFICO SIMPLE' : 'GRÁFICO DUAL'}
            </span>
       </div>
       
       <div className={cn(
           "flex-grow flex flex-col",
           mode === 'dual' && "divide-y divide-white/10"
       )}>
           {data.map((item, idx) => (
               <Plot key={idx} {...item} />
           ))}
       </div>
    </div>
  );
};
