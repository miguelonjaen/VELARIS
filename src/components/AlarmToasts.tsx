import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Info, BellOff, X, Zap } from 'lucide-react';
import { SmartshipAlarm } from '../shared/types';

interface AlarmToastsProps {
  alarms: SmartshipAlarm[];
  onRemove: (id: string) => void;
  isMuted: boolean;
  onMuteToggle: () => void;
}

export const AlarmToasts: React.FC<AlarmToastsProps> = ({
  alarms,
  onRemove,
  isMuted,
  onMuteToggle,
}) => {
  return (
    <div className="fixed top-1 right-50 z-[10000] flex flex-col gap-3 pointer-events-none">

      <div className="flex justify-center pointer-events-auto">
        <button
          onClick={onMuteToggle}
          className={`px-3 py-1 rounded-xl backdrop-blur-md border flex items-center gap-1.5 transition-all ${
            isMuted
              ? 'bg-slate-900/80 border-slate-700 text-slate-400'
              : 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-lg shadow-amber-900/20'
          }`}
          title={isMuted ? 'Activar Alertas Sonoras' : 'Silenciar Alertas'}
          id="btn-mute-watchdog"
        >
          {isMuted ? (
            <BellOff size={12} />
          ) : (
            <Zap size={10} className="animate-pulse" />
          )}

          <span className="text-[9px] font-black uppercase tracking-[0.18em]">
            {isMuted ? 'MUTED' : 'SHIELD'}
          </span>
        </button>
      </div>

      <AnimatePresence mode="popLayout">
        {alarms.map((alarm) => (
          <motion.div
            key={alarm.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
            layout
            className={`pointer-events-auto p-4 rounded-[32px] border backdrop-blur-xl shadow-2xl relative overflow-hidden ${
              alarm.severity === 'critical'
                ? 'bg-red-950/80 border-red-500/50 text-red-50'
                : 'bg-amber-900/80 border-amber-500/50 text-amber-50'
            }`}
            id={`alarm-${alarm.id}`}
          >
            {alarm.severity === 'critical' && (
              <motion.div
                animate={{ opacity: [0.1, 0.3, 0.1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="absolute inset-0 bg-red-600/20 pointer-events-none"
              />
            )}

            <div className="flex items-start gap-3 relative z-10">
              <div
                className={`p-2 rounded-xl flex-shrink-0 ${
                  alarm.severity === 'critical'
                    ? 'bg-red-500 text-white'
                    : 'bg-amber-500 text-white'
                }`}
              >
                {alarm.severity === 'critical' ? (
                  <AlertTriangle size={20} />
                ) : (
                  <Info size={20} />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-70">
                    {alarm.type.replace('_', ' ')}
                  </span>

                  <span className="text-[10px] font-mono opacity-50">
                    {new Date(alarm.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>

                <p className="text-sm font-bold leading-tight mt-1 mb-1">
                  {alarm.message}
                </p>
              </div>

              <button
                onClick={() => onRemove(alarm.id)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};