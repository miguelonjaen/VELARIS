import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigation, X } from 'lucide-react';

interface RouteBriefingProps {
  briefing: string | null;
  onClose: () => void;
}

export const RouteBriefing: React.FC<RouteBriefingProps> = ({ briefing, onClose }) => {
  return (
    <AnimatePresence>
      {briefing && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[6000] w-full max-w-md px-4"
        >
          <div className="bg-slate-900/90 backdrop-blur-md border border-cyan-500/30 p-4 rounded-2xl shadow-[0_0_30px_rgba(6,182,212,0.2)]">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-cyan-400" />
                <h3 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Briefing Táctico de Ruta</h3>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <p className="text-xs font-bold text-slate-300 leading-relaxed">
              {briefing}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
