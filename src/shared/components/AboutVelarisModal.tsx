import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface AboutVelarisModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutVelarisModal: React.FC<AboutVelarisModalProps> = ({ isOpen, onClose }) => {
  const [appVersion, setAppVersion] = useState('...');

  useEffect(() => {
    const loadVersion = async () => {
      try {
        const version = await window.VELARISAPI.getAppVersion();
        setAppVersion(version);
      } catch {
        setAppVersion('Unknown');
      }
    };

    loadVersion();
  }, []);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
        />

        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          className="relative w-full max-w-xl bg-slate-900 border border-cyan-500/30 rounded-[2.5rem] shadow-[0_0_50px_rgba(6,182,212,0.20)] overflow-hidden"
        >
          <div className="pt-8 pb-6 flex flex-col items-center">
            <img src="/logo.png" alt="VELARIS" className="w-48 h-48 object-contain" />

            <h1 className="text-3xl font-black tracking-[0.18em] text-white uppercase -mt-8">
              VELARIS
            </h1>

            <p className="mt-2 text-cyan-400 uppercase tracking-[0.28em] text-xs font-bold">
              Professional Marine Navigation Suite
            </p>

            <p className="mt-5 max-w-md text-center text-sm leading-relaxed text-slate-400">
              Designed for sailors who demand precision, reliability and complete situational awareness.
            </p>
          </div>

          <div className="px-10 pb-8 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-2xl border border-white/5 p-5">
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-400 mb-2">
                  Build
                </p>
                <p className="text-lg font-black text-white">{appVersion} • Stable</p>
              </div>

              <div className="bg-white/5 rounded-2xl border border-white/5 p-5">
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-400 mb-2">
                  Engine
                </p>
                <p className="text-sm font-semibold text-white leading-relaxed">
                  Electron
                  <br />
                  React
                  <br />
                  TypeScript
                </p>
              </div>

              <div className="bg-white/5 rounded-2xl border border-white/5 p-5">
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-400 mb-2">
                  Charts
                </p>
                <p className="text-sm font-semibold text-white">Powered by SmartCharts™</p>
              </div>

              <div className="bg-white/5 rounded-2xl border border-white/5 p-5">
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-400 mb-2">
                  AI Engine
                </p>
                <p className="text-sm font-semibold text-white">Gemini Tactical Engine</p>
              </div>
            </div>

            <div className="pt-5 border-t border-white/5 text-center">
              <p className="text-sm italic text-slate-300">Crafted with passion for professional navigation.</p>
              <p className="mt-5 text-xs text-slate-500">© 2026 VELARIS Navigation Systems</p>
              <p className="text-[10px] text-slate-600 mt-1">All Rights Reserved</p>
              <p className="text-[10px] text-slate-600">Designed and Developed by MiguelonJaen</p>
            </div>

            <button
              onClick={onClose}
              className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 rounded-2xl text-white font-black uppercase tracking-[0.25em] transition-all"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
