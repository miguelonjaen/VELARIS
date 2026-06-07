import React from 'react';
import { Volume2 } from 'lucide-react';
import { VADEMECUM_SIGNALS, FLAGS } from '../constants';

interface GuideVademecumProps {
  playSignal: (pattern: number[]) => void;
  onClose?: () => void;
}

const GuideVademecum: React.FC<GuideVademecumProps> = ({ playSignal }) => {
  return (
    <div className="p-8 space-y-12 max-w-6xl mx-auto">
      <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Vademécum Náutico</h2>
      <section className="space-y-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2">Señales Acústicas (RIPA)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {VADEMECUM_SIGNALS.map(sig => (
            <button key={sig.id} onClick={() => playSignal(sig.pattern)} className="flex items-center justify-between p-5 bg-slate-950/50 border border-slate-800 rounded-2xl hover:bg-slate-900 transition-all group">
              <div className="flex items-center gap-4">
                <Volume2 className="w-5 h-5 text-cyan-500 group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <p className="text-xs font-black text-white uppercase tracking-tighter">{sig.label}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{sig.description}</p>
                </div>
              </div>
              <span className="text-[8px] font-black text-cyan-500/30 uppercase">{sig.type}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2">Código de Banderas</p>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {FLAGS.map(f => (
            <div key={f.char} className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl text-center group cursor-help relative">
              <img src={f.img} alt={f.char} className="w-full aspect-square rounded-lg mb-2 opacity-80 group-hover:opacity-100 transition-all" />
              <p className="text-lg font-black text-white">{f.char}</p>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-3 bg-slate-900 border border-slate-700 rounded-xl text-[9px] font-bold text-slate-300 opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 shadow-2xl">
                {f.meaning}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default GuideVademecum;
