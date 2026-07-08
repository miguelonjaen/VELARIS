import React, { useState } from 'react';
import { cn } from '../../../lib/utils';
import {
  Map,
  Compass,
  Sailboat,
  Flag,
  Wind,
  Menu,
  Power,
  Radar,
  Crosshair,
  Zap
} from 'lucide-react';

import { ZeusLayerMenu } from '../../../components/ZeusLayerMenu';
import { AISTacticalDrawer } from '../../../AISTacticalDrawer';
import { motion, AnimatePresence } from 'motion/react';

interface ZeusSidebarProps {
  activePage: string;
  onSelect: (id: string) => void;
  onToggleMenu: () => void;
  isNavigating: boolean;
  listaCartas: any[];
  cartasActivas: Record<string, boolean>;
  toggleCarta: (name: string) => void;
  cartasOpacity: Record<string, number>;
  setCartasOpacity: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  layersState: any;
  setLayersState: React.Dispatch<React.SetStateAction<any>>;
  aisEnabled: boolean;
  windEnabled: boolean;
  isWeatherPanelOpen: boolean;
  setIsWeatherPanelOpen: (val: boolean) => void;
  isLaylinesActive: boolean;
  setIsLaylinesActive: (val: boolean) => void;
  isSailSteerWidgetOpen: boolean;
  setIsSailSteerWidgetOpen: (val: boolean) => void;
  collisionFilter: boolean;
  autopilotMode: 'standby' | 'auto' | 'wind' | 'nav';
  onToggleAIS: () => void;
  onToggleWind: () => void;
  onToggleCollisionFilter: () => void;
  onToggleAutopilot: () => void;
  aisTargets: any[];
  className?: string;
}

export const ZeusSidebar: React.FC<ZeusSidebarProps> = ({
  activePage,
  onSelect,
  onToggleMenu,
  isNavigating,
  listaCartas,
  cartasActivas,
  toggleCarta,
  aisTargets,
  cartasOpacity,
  setCartasOpacity,
  layersState,
  setLayersState,
  aisEnabled,
  windEnabled,
  collisionFilter,
  autopilotMode,
  onToggleAIS,
  onToggleWind,
  onToggleCollisionFilter,
  onToggleAutopilot,
  isWeatherPanelOpen,
  setIsWeatherPanelOpen,
  isLaylinesActive,
  setIsLaylinesActive,
  isSailSteerWidgetOpen,
  setIsSailSteerWidgetOpen,
  className
}) => {
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const [isAISDrawerOpen, setIsAISDrawerOpen] = useState(false);

  const mainButtons = [
    { id: 'chart', icon: Map, label: 'CHART' },
    { id: 'nav', icon: Compass, label: 'NAV' },
    { id: 'sail', icon: Sailboat, label: 'SAIL' },
    { id: 'race', icon: Flag, label: 'RACE' },
  ];

  return (
    <>
      <ZeusLayerMenu
        isOpen={isLayersOpen}
        onClose={() => setIsLayersOpen(false)}
        layersState={layersState}
        setLayersState={setLayersState}
        listaCartas={listaCartas}
        cartasActivas={cartasActivas}
        toggleCarta={toggleCarta}
        cartasOpacity={cartasOpacity}
        setCartasOpacity={setCartasOpacity}
      />

      <AISTacticalDrawer
        isOpen={isAISDrawerOpen}
        targets={aisTargets}
        onClose={() => setIsAISDrawerOpen(false)}
      />

      <aside
  className={cn(
    'absolute right-6 top-24 bottom-24 w-[88px] bg-[#050607]/90 backdrop-blur-xl border border-white/10 rounded-[32px] py-6 flex flex-col items-center z-[7000] shadow-2xl',
    className
  )}
>
        <button
          onClick={onToggleMenu}
          className="w-16 h-16 flex items-center justify-center rounded-2xl bg-white/5 hover:bg-white/10 transition-colors text-slate-300"
        >
          <Menu size={24} />
        </button>

        <div className="w-8 h-px bg-white/10 my-4" />

        {mainButtons.map((btn, index) => (
          <React.Fragment key={btn.id}>
            {index === 3 && (
              <div className="h-px w-8 bg-white/10 my-4 mx-auto" />
            )}
            {/* SAIL */}
            <button
              onClick={() => {
                onSelect(btn.id);

                if (btn.id === 'chart') {
                  setIsLayersOpen(!isLayersOpen);
                }

                if (btn.id === 'sail') {
  const nextState = !isSailSteerWidgetOpen;

  setIsSailSteerWidgetOpen(nextState);
  setIsLaylinesActive(nextState);
}
              }}
              className={cn(
  'relative w-16 h-16 flex items-center justify-center rounded-2xl transition-all duration-300 border',
  activePage === btn.id ||
  (btn.id === 'chart' && isLayersOpen) ||
  (btn.id === 'sail' && isSailSteerWidgetOpen)
    ? 'bg-cyan-500/10 border-cyan-400/40 text-white shadow-[0_0_30px_rgba(34,211,238,0.25)]'
    : 'bg-slate-900/60 border-white/5 text-slate-400 hover:text-slate-200'
)}
>
  <btn.icon size={24} />

  <AnimatePresence>
  {(
    activePage === btn.id ||
    (btn.id === 'chart' && isLayersOpen) ||
    (btn.id === 'sail' && isSailSteerWidgetOpen)
  ) && (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{
  scale: [1, 1.15, 1],
  opacity: [0.85, 1, 0.85],
}}
      exit={{ scale: 0, opacity: 0 }}
      transition={{
  duration: 2.2,
  repeat: Infinity,
  ease: "easeInOut",
}}
      className="absolute bottom-2 w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.9)]"
    />
  )}
</AnimatePresence>
</button>
          </React.Fragment>
        ))}

        <div className="w-8 h-px bg-white/10 my-4" />

        {/* AIS */}
        <button
          onClick={() => {
            setIsAISDrawerOpen(!isAISDrawerOpen);
                      }}
          className={cn(
            'w-16 h-16 flex flex-col items-center justify-center rounded-2xl transition-all border',
            isAISDrawerOpen
              ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_15px_#22d3ee]'
              : 'bg-black/40 border-white/5 text-slate-500 hover:text-slate-200'
          )}
        >
          <Radar size={24} />
          
        </button>

        {/* WIND */}
        <button
          onClick={onToggleWind}
          className={cn(
            'w-16 h-16 flex flex-col items-center justify-center rounded-2xl transition-all border',
            windEnabled
              ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_15px_#22d3ee]'
              : 'bg-black/40 border-white/5 text-slate-500 hover:text-slate-200'
          )}
        >
          <Wind size={24} />
          
        </button>

        {/* CPA */}
        <button
          onClick={onToggleCollisionFilter}
          className={cn(
            'w-16 h-16 flex flex-col items-center justify-center rounded-2xl transition-all border',
            collisionFilter
              ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_15px_#22d3ee]'
              : 'bg-black/40 border-white/5 text-slate-500 hover:text-slate-200'
          )}
        >
          <Crosshair size={24} />
          
        </button>

        {/* AUTO */}
<button
  onClick={onToggleAutopilot}
  className={cn(
    'w-16 h-16 flex flex-col items-center justify-center rounded-2xl transition-all border',
    autopilotMode !== 'standby'
      ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_15px_#22d3ee]'
      : 'bg-black/40 border-white/5 text-slate-500 hover:text-slate-200'
  )}
>
  <Zap size={24} />
  
</button>

<div className="w-8 h-px bg-white/10 my-4" />

<div className="pt-2">
  <button
    className={cn(
      'w-16 h-16 flex items-center justify-center rounded-full border transition-all',
      isNavigating
        ? 'bg-red-950 border-red-500 text-red-500 animate-pulse'
        : 'bg-slate-900 border-slate-700 text-slate-600'
    )}
  >
    <Power size={24} />
  </button>
</div>
      </aside>
    </>
  );
};