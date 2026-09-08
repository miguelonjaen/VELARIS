import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert, AlertTriangle, Terminal, Zap } from 'lucide-react';
import { cn } from '../lib/utils';

interface TacticalAdvisorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  message: string | null;
  priority: 'info' | 'warning' | 'critical';
  isProcessing?: boolean;
  actions?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  }[];
}

export const TacticalAdvisorPanel: React.FC<TacticalAdvisorPanelProps> = ({
  isOpen,
  onClose,
  message,
  priority,
  isProcessing,
  actions
}) => {
  const displayMessage = message || "Iniciando sistemas tácticos...";
  
  const getBorderColor = () => {
    switch (priority) {
      case 'critical': return 'border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.5)]';
      case 'warning': return 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] shadow-amber-900/10';
      default: return 'border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)] shadow-cyan-900/10';
    }
  };

  const getIcon = () => {
    switch (priority) {
      case 'critical': return <ShieldAlert className="w-6 h-6 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-6 h-6 text-amber-500" />;
      default: return <Terminal className="w-6 h-6 text-cyan-500" />;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
  initial={{ y: -100, opacity: 0 }}
  animate={{ y: 0, opacity: 1 }}
  exit={{ y: -100, opacity: 0 }}
  className={cn(
    "fixed top-24 right-6 w-[min(36rem,calc(100vw-3rem))] z-[9999]",
    "pointer-events-none"
  )}
>
          <div className={cn(
  "pointer-events-auto",
  "bg-black/90 backdrop-blur-2xl rounded-[24px] border-2 p-6",
  "flex max-h-[calc(100vh-9rem)] flex-col gap-4 overflow-hidden",
  getBorderColor(),
  priority === 'critical' && 'animate-pulse'
)}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <div className="bg-cyan-500/20 p-1 rounded-md">
                  <Zap className="w-3 h-3 text-cyan-400" />
                </div>
                <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] font-mono">
                  Tactical Advisor
                </span>
              </div>
              <button 
                onClick={onClose}
                className="p-1 hover:bg-white/10 rounded-lg transition-all"
              >
                <X className="w-5 h-5 text-white/30 hover:text-white" />
              </button>
            </div>

            {/* Content body */}
            <div className="flex min-h-0 flex-1 gap-5 items-start relative overflow-y-auto">
              {isProcessing && (
                <div className="absolute inset-0 z-0 opacity-20 pointer-events-none flex items-center justify-center">
                  <div className="radar-pulse-container">
                    <div className="radar-pulse-ring !border-cyan-500"></div>
                    <div className="radar-pulse-ring !border-cyan-500"></div>
                    <div className="radar-pulse-ring !border-cyan-500"></div>
                  </div>
                </div>
              )}
              
              <div className={cn(
                "p-3.5 rounded-2xl border relative z-10", // Larger icon container
                priority === 'critical' ? 'bg-red-500/20 border-red-500/30' :
                priority === 'warning' ? 'bg-amber-500/20 border-amber-500/30' :
                'bg-cyan-500/20 border-cyan-500/30',
                isProcessing && "animate-pulse"
              )}>
                {getIcon()}
              </div>
              <div className="flex-1 min-w-0 relative z-10">
                <p className={cn(
                  "font-mono text-sm leading-relaxed antialiased font-medium",
                  priority === 'critical' ? 'text-red-400' :
                  priority === 'warning' ? 'text-amber-400' :
                  'text-cyan-400'
                )}>
                  {displayMessage}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[8px] font-bold text-white/20 uppercase tracking-[0.2em]">
                    {new Date().toLocaleTimeString()}
                  </span>
                  <span className={cn(
                    "text-[8px] font-black uppercase px-2 py-0.5 rounded-full border",
                    priority === 'critical' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                    priority === 'warning' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                    'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                  )}>
                    {priority}
                  </span>
                </div>
                
                {actions && actions.length > 0 && (
                  <div className="mt-4 flex flex-col gap-2">
                    {actions.map((act, idx) => (
                      <button
                        key={idx}
                        onClick={act.onClick}
                        className={cn(
                          "w-full py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg",
                          act.variant === 'secondary' 
                            ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/5" 
                            : "bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/20"
                        )}
                      >
                        {act.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const TacticalAdvisorToggle: React.FC<{ onOpen: () => void; hasNewMessage?: boolean }> = ({ onOpen, hasNewMessage }) => {
  return (
    <button 
      onClick={onOpen}
      className={cn(
        "fixed bottom-24 right-8 z-[90] w-14 h-14 rounded-2xl",
        "bg-black border-2 border-cyan-500/30 shadow-2xl shadow-black",
        "flex items-center justify-center transition-all hover:scale-110 active:scale-95 group",
        hasNewMessage && "animate-bounce border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
      )}
    >
      <div className="relative">
        <Terminal className="w-7 h-7 text-cyan-500 group-hover:text-white transition-colors" />
        {hasNewMessage && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-black animate-pulse" />
        )}
      </div>
    </button>
  );
};
