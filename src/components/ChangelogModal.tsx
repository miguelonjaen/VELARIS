import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Zap, ShieldCheck, Settings, Anchor } from 'lucide-react';
import { ChangelogEntry } from '../config/changelog';
import { cn } from '../lib/utils';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ChangelogEntry;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose, data }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-slate-900 border border-cyan-500/30 rounded-[2.5rem] shadow-[0_0_50px_rgba(6,182,212,0.2)] overflow-hidden"
          >
            {/* Header */}
            <div className="p-8 bg-gradient-to-b from-cyan-500/10 to-transparent border-b border-white/5">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-cyan-500/20 rounded-2xl border border-cyan-500/30">
                  <Zap className="w-6 h-6 text-cyan-400 animate-pulse" />
                </div>
                <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">Novedades de Sistemas</h2>
              <p className="text-[10px] font-bold text-cyan-500 uppercase tracking-[0.2em] mt-1">Versión {data.version} • {data.date}</p>
            </div>

            {/* Body */}
            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <p className="text-sm font-bold text-slate-300 italic">"Almirante, el puente de mando ha sido actualizado con las siguientes capacidades tácticas:"</p>
              
              <div className="space-y-4">
                {data.features.map((item, idx) => (
                  <div key={idx} className="flex gap-4 p-4 bg-white/5 border border-white/5 rounded-2xl group hover:border-cyan-500/20 transition-all">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <p className={cn(
                        "text-[8px] font-black uppercase tracking-widest mb-1",
                        item.category === 'tactical' ? "text-cyan-400" : 
                        item.category === 'security' ? "text-emerald-400" : "text-amber-400"
                      )}>
                        {item.category === 'tactical' ? 'Navegación Táctica' : 
                         item.category === 'security' ? 'Seguridad y Resiliencia' : 'Mejora de Sistemas'}
                      </p>
                      <p className="text-xs text-slate-400 font-medium leading-relaxed group-hover:text-white transition-colors">
                        {item.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-8 pt-0">
              <button 
                onClick={onClose}
                className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg shadow-cyan-900/20 flex items-center justify-center gap-2"
              >
                <Anchor size={16} /> Entendido, Almirante
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};