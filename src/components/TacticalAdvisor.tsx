import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Terminal, AlertTriangle, ShieldCheck, MessageSquareCode, Loader2 } from 'lucide-react';
import { callGemini } from '../lib/gemini';

interface TacticalAdvisorProps {
  windSpeed: number;
  shipSpeed: number;
  fuelLevel: number;
  depth: number;
  isEngineOn: boolean;
  aisTargets?: any[];
}

interface Advice {
  text: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: string;
}

export const TacticalAdvisor: React.FC<TacticalAdvisorProps> = ({
  windSpeed,
  shipSpeed,
  fuelLevel,
  depth,
  isEngineOn,
  aisTargets = []
}) => {
  const [advice, setAdvice] = useState<Advice>({
    text: "XO Iniciado. Esperando telemetría...",
    priority: 'low',
    timestamp: new Date().toLocaleTimeString()
  });
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  
  const lastAiCheckRef = useRef<number>(0);

  // Analysis Loop (Every 5 seconds)
  useEffect(() => {
    const analyzeData = async () => {
      // 1. Local Heuristics (Instant alerts)
      let localAdvice: Advice | null = null;

      if (depth < 2.0) {
        localAdvice = {
          text: "¡PELIGRO: BAJO CALADO! Profundidad < 2m. Maniobre de inmediato.",
          priority: 'high',
          timestamp: new Date().toLocaleTimeString()
        };
      } else if (fuelLevel < 15 && isEngineOn) {
        localAdvice = {
          text: "ALERTA COMBUSTIBLE: Nivel bajo (15%). Planifique repostaje.",
          priority: 'high',
          timestamp: new Date().toLocaleTimeString()
        };
      } else if (windSpeed > 30) {
        localAdvice = {
          text: "VIENTO EXTREMO: Considere reducir superficie vélica de inmediato.",
          priority: 'high',
          timestamp: new Date().toLocaleTimeString()
        };
      } else if (depth < 5.0) {
        localAdvice = {
          text: "PRECAUCIÓN: Aguas poco profundas detectadas.",
          priority: 'medium',
          timestamp: new Date().toLocaleTimeString()
        };
      }

      // If we have a local high priority alert, show it immediately
      if (localAdvice && localAdvice.priority === 'high') {
        setAdvice(localAdvice);
        return;
      }

      // 2. AI Advanced Analysis (Every 30 seconds)
      const now = Date.now();
      if (now - lastAiCheckRef.current > 30000) {
        lastAiCheckRef.current = now;
        setIsAiProcessing(true);
        try {
          const prompt = `Eres el Almirante Segundo de a bordo. Analiza estos datos náuticos actuales:
            - Viento: ${windSpeed} kn
            - Velocidad Buque: ${shipSpeed} kn
            - Combustible: ${fuelLevel}%
            - Profundidad: ${depth}m
            - Motor: ${isEngineOn ? 'Encendido' : 'Apagado'}
            - Blancos AIS: ${aisTargets.length}
            
            Da un consejo táctico BREVE y DIRECTO (máximo 12 palabras). Usa lenguaje náutico profesional.`;
          
          const result = await callGemini(prompt);
          const resultText = result.text.trim();
          
          if (resultText) {
            setAdvice({
              text: resultText,
              priority: 'low',
              timestamp: new Date().toLocaleTimeString()
            });
          }
        } catch (err) {
          console.error("Tactical Advisor AI Error:", err);
        } finally {
          setIsAiProcessing(false);
        }
      } else if (localAdvice) {
        // Show medium priority local advice if no AI check this turn
        setAdvice(localAdvice);
      }
    };

    const interval = setInterval(analyzeData, 5000);
    return () => clearInterval(interval);
  }, [windSpeed, shipSpeed, fuelLevel, depth, isEngineOn, aisTargets]);

  return (
    <div className="bg-black/80 border border-emerald-500/30 rounded-2xl p-4 font-mono overflow-hidden shadow-[0_0_30px_rgba(16,185,129,0.1)] relative">
      {/* Terminal Header */}
      <div className="flex items-center justify-between mb-3 border-b border-emerald-500/20 pb-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-3 h-3 text-emerald-500" />
          <span className="text-[10px] font-bold text-emerald-500/70 uppercase tracking-widest">Tactical Advisor / XO-1</span>
        </div>
        <div className="flex items-center gap-2">
          {isAiProcessing && <Loader2 className="w-3 h-3 text-emerald-500 animate-spin" />}
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]" />
        </div>
      </div>

      {/* Advice Display */}
      <div className="min-h-[60px] flex items-start gap-3">
        <AnimatePresence mode="wait">
          <motion.div 
            key={advice.text}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="flex-1"
          >
            <div className={`text-xs font-bold leading-relaxed tracking-tight ${
              advice.priority === 'high' 
                ? 'text-red-500 animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]' 
                : advice.priority === 'medium'
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}>
              <span className="opacity-50 mr-1 text-[10px] tracking-tighter">[{advice.timestamp}]</span>
              {advice.text}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Decorative Scanline */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] z-10 opacity-30" />
      
      {/* Priorities Info */}
      <div className="mt-3 flex gap-4 border-t border-emerald-500/10 pt-2 opacity-40">
        <div className="flex items-center gap-1 text-[8px] text-emerald-500 uppercase font-black">
          <ShieldCheck className="w-2 h-2" /> 
          <span>Status: Protected</span>
        </div>
        <div className="flex items-center gap-1 text-[8px] text-emerald-500 uppercase font-black">
          <Zap className="w-2 h-2" /> 
          <span>Vented: OK</span>
        </div>
      </div>
    </div>
  );
};
