import React, { useRef, useEffect, useState } from 'react';
import { Terminal, History, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@lib/utils';

interface Message {
  role: 'user' | 'ai';
  text: string;
  id?: string;
}

interface TacticalTerminalProps {
  messages: Message[];
  onClearHistory: () => void;
  isIntMin: boolean;
  setIsIntMin: (val: boolean) => void;
}

export const TacticalTerminal: React.FC<TacticalTerminalProps> = ({
  messages,
  onClearHistory,
  isIntMin,
  setIsIntMin
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const prevMessagesLength = useRef(0);

  const handleScroll = () => {
    if (!terminalRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
    // Si el usuario sube manualmente, desactivamos el auto-scroll
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 30;
    setIsAutoScrollEnabled(isAtBottom);
  };

  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      if (isAutoScrollEnabled && messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' }); 
      }
    }
    prevMessagesLength.current = messages.length;
  }, [messages, isAutoScrollEnabled]);

  return (
    <div className={cn(
      "absolute z-[1000] overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col min-h-0 transition-all duration-500 border border-cyan-500/30",
      isIntMin 
        ? "bottom-24 left-6 h-8 w-[260px] rounded-full bg-[#050607]/90 backdrop-blur-md border-cyan-500/20"
        : "top-30 left-6 h-[500px] w-80 rounded-2xl bg-[#0a0f18]/95 backdrop-blur-xl"
    )}>
      <div 
        className={cn(
  "flex items-center cursor-pointer select-none",
  isIntMin
    ? "h-full px-4 justify-start gap-3"
    : "px-4 py-3 bg-white/5 border-b border-white/5 justify-between"
)}
        onClick={() => setIsIntMin(!isIntMin)}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className={cn(
            "w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]",
            isIntMin && "animate-pulse"
          )} />
          {isIntMin ? (
            <span className="text-[9px] font-black text-cyan-400 tracking-[0.1em] uppercase">
              &gt; NÚCLEO IA OPERATIVO
            </span>
          ) : (
            <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">TERMINAL TÁCTICO IA</span>
          )}
        </div>

        {!isIntMin && (
          <div className="flex gap-2">
            <button
              className="text-slate-500 hover:text-white transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onClearHistory();
              }}
              title="Clear History"
            >
              <History size={14} />
            </button>
            <button className="text-slate-500 hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); setIsIntMin(!isIntMin); }}>
              <motion.div animate={{ rotate: 180 }} transition={{ duration: 0.3 }}>
                <ChevronDown size={14} />
              </motion.div>
            </button>
          </div>
        )}
      </div>
      {!isIntMin && (
        <div ref={terminalRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-black/20">
          {messages.map((msg, idx) => (
            <div key={idx} className={cn("text-xs font-mono break-words p-2 rounded-lg", msg.role === 'ai' ? "text-emerald-400 bg-emerald-500/5" : "text-cyan-400 bg-cyan-500/5 border-l border-cyan-500/30")}>
              {msg.role === 'ai' ? `IA_OFFICER: ${msg.text}` : `> ${msg.text}`}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
};