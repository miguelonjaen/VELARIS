import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Anchor } from 'lucide-react';
import type { Release } from '../content/releases';
import { cn } from '../lib/utils';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: Release;
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
            <div className="p-1 bg-gradient-to-b from-cyan-500/10 to-transparent border-b border-white/5">
              <div className="relative flex justify-center mb-1">
  <img
    src="/logo.png"
    alt="VELARIS"
    className="w-50 h-50 object-contain"
  />

  
</div>
              <div className="flex flex-col items-center -mt-8 mb-2">
  <h2 className="text-2xl font-black text-white uppercase tracking-tight text-center">
    What's New
  </h2>

  <p className="mt-1 text-[11px] font-semibold text-cyan-400 uppercase tracking-[0.25em] text-center">
    Build {data.version} • Stable
  </p>
</div>
            </div>

            {/* Body */}
            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <p className="text-sm font-medium text-slate-300 leading-relaxed">
  {data.summary}</p>
              
              <div className="space-y-4">
                {data.sections.map((section, idx) => (
                  <div key={`${section.title}-${idx}`} className="flex gap-4 p-4 bg-white/5 border border-white/5 rounded-2xl group hover:border-cyan-500/20 transition-all">
                    <span className="text-2xl">{section.icon}</span>
                    <div className="flex-1">
                      <p className={cn(
                        "text-[8px] font-black uppercase tracking-widest mb-2",
                        "text-cyan-400"
                      )}>
                        {section.title}
                      </p>
                      <ul className="space-y-2">
                        {section.items.map((item, itemIdx) => (
                          <li
                            key={`${section.title}-${itemIdx}`}
                            className="text-xs text-slate-400 font-medium leading-relaxed group-hover:text-white transition-colors"
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
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
                <Anchor size={16} /> Entendido
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};