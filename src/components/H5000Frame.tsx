import React from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

interface H5000FrameProps {
  title?: string;
  hdg?: number;
  isNavigating?: boolean;
  onClose?: () => void;
  children?: React.ReactNode;
  className?: string;
}

export const H5000Frame: React.FC<H5000FrameProps> = ({
  title,
  hdg,
  isNavigating,
  onClose,
  children,
  className,
}) => {
  return (
    <div className={cn('relative w-full h-full flex flex-col', className || '')}>
      <div className="absolute inset-0 pointer-events-none border border-black/40 rounded-[18px] z-50 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]" />

      <div className="bg-black px-4 pt-3 pb-1 flex items-center justify-between z-40 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-1.5 h-1.5 rounded-full shadow-lg transition-all duration-1000',
              isNavigating ? 'bg-[#00ffcc] animate-pulse' : 'bg-slate-800',
            )}
          />
          <span className="text-[9px] font-black text-cyan-300 uppercase tracking-[0.25em] font-sans">
            VELARIS
          </span>
        </div>

        <div className="flex items-center gap-3">
          {title && <span className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.3em] mr-2">{title}</span>}
          {typeof hdg === 'number' && (
            <span className="text-[10px] font-bold text-white font-mono tracking-widest">HDG {hdg.toString().padStart(3, '0')}°</span>
          )}
          {onClose && (
            <button onClick={onClose} className="opacity-20 hover:opacity-100 transition-opacity ml-2">
              <X size={12} className="text-white" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 bg-[#050505]/30" />
        <div className="relative z-10 w-full h-full">
          <div className="h-full w-full overflow-auto p-3 custom-scrollbar">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default H5000Frame;
