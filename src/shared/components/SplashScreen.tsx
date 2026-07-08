import React from 'react';
import { motion } from 'motion/react';

interface SplashScreenProps {
  status: string;
  version: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  status,
  version,
}) => {
  return (
    <div className="fixed inset-0 z-[99999] overflow-hidden bg-slate-950">
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.08),transparent_65%)]"
        animate={{ opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative flex h-full flex-col items-center justify-center px-8">
        <motion.img
          src="/logo.png"
          alt="VELARIS"
          className="w-40 h-40 object-contain"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: [1, 1.01, 1] }}
          transition={{
            opacity: { duration: 0.8 },
            scale: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
          }}
        />
        <motion.h1
          className="-mt-6 text-4xl font-black tracking-[0.22em] text-white uppercase"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
        >
          VELARIS
        </motion.h1>

        <motion.p
          key={status}
          className="mt-3 text-xs font-bold uppercase tracking-[0.35em] text-cyan-400 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Professional Marine Navigation Suite
        </motion.p>
        <div className="mt-8 h-px w-64 bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

        <motion.div
          className="mt-20 flex flex-col items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
        >
          <p className="text-sm text-slate-300">{status}</p>
          <div className="mt-6 h-px w-56 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
        </motion.div>
      </div>

      <motion.div
        className="absolute bottom-10 left-0 right-0 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400">
          VELARIS {version}
        </p>

        <p className="mt-1 text-[9px] uppercase tracking-[0.35em] text-slate-600">
          Stable Release
        </p>
      </motion.div>
    </div>
  );
};
