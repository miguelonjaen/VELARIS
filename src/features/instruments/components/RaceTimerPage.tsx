import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

export const RaceTimerPage = ({ onFinished }: { onFinished: () => void }) => {
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isRunning && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isRunning) {
      setIsRunning(false);
      onFinished();
    }
    return () => clearInterval(timer);
  }, [isRunning, timeLeft, onFinished]);

  const toggleTimer = () => setIsRunning(!isRunning);
  const resetTimer = () => { setIsRunning(false); setTimeLeft(300); };
  const syncTimer = () => { setTimeLeft(Math.round(timeLeft / 60) * 60); };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-white p-6 overflow-hidden">
        {/* Background Grid */}
        <div className="absolute inset-0 grid grid-cols-2 border-zinc-100 pointer-events-none">
            <div className="border-r border-zinc-100" />
            <div />
        </div>

        <div className="text-[8px] font-black text-zinc-500 uppercase tracking-[0.3em] mb-4 relative z-10">TIMER REGATA</div>
        <div className="text-7xl font-black text-black font-mono tracking-tighter leading-none relative z-10">{formatTime(timeLeft)}</div>
        
        <div className="mt-12 grid grid-cols-3 gap-2 w-full max-w-[240px] relative z-10">
            <button 
                onClick={toggleTimer} 
                className={cn(
                    "px-2 py-3 rounded border font-black text-[9px] uppercase transition-all active:scale-95 shadow-sm",
                    isRunning ? "bg-red-500 text-white border-red-600" : "bg-black text-white border-black"
                )}
            >
                {isRunning ? 'STOP' : 'START'}
            </button>
            <button 
                onClick={syncTimer} 
                className="bg-white text-black border border-zinc-300 px-2 py-3 rounded font-black text-[9px] uppercase shadow-sm active:scale-95"
            >
                SYNC
            </button>
            <button 
                onClick={resetTimer} 
                className="bg-white text-black border border-zinc-300 px-2 py-3 rounded font-black text-[9px] uppercase shadow-sm active:scale-95"
            >
                RESET
            </button>
        </div>

        <div className="absolute bottom-6 text-[6px] font-black text-zinc-400 uppercase tracking-widest">
            SINC AL MINUTO MÁS CERCANO
        </div>
    </div>
  );
};
