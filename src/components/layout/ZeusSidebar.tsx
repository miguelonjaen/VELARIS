import React, { useState } from 'react';
import { cn } from '../../lib/utils';
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

import { ZeusLayerMenu } from '../ZeusLayerMenu';
import { AISTacticalDrawer } from '../../AISTacticalDrawer';

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
    'absolute right-6 top-18 bottom-18 w-[72px] bg-[#050607]/90 backdrop-blur-xl border border-white/10 rounded-[24px] py-4 flex flex-col items-center z-[7000] shadow-2xl',
    className
  )}
>
        <button
          onClick={onToggleMenu}
          className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-slate-300"
        >
          <Menu size={20} />
        </button>

        <div className="w-8 h-px bg-white/10 my-2" />

        {mainButtons.map((btn, index) => (
          <React.Fragment key={btn.id}>
            {index === 3 && (
              <div className="h-px w-8 bg-white/10 my-2 mx-auto" />
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
                'w-12 h-12 flex flex-col items-center justify-center rounded-xl transition-all border',
                activePage === btn.id ||
                  (btn.id === 'chart' && isLayersOpen) ||
                  (btn.id === 'sail' && isSailSteerWidgetOpen)
                  ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_15px_#22d3ee]'
                  : 'bg-black/40 border-white/5 text-slate-500 hover:text-slate-200'
              )}
            >
              <btn.icon size={20} />
              <span className="text-[6px] font-black mt-1 uppercase tracking-tighter">
                {btn.label}
              </span>
            </button>
          </React.Fragment>
        ))}

        <div className="w-8 h-px bg-white/10 my-2" />

        {/* AIS */}
        <button
          onClick={() => {
            setIsAISDrawerOpen(!isAISDrawerOpen);
                      }}
          className={cn(
            'w-12 h-12 flex flex-col items-center justify-center rounded-xl transition-all border',
            isAISDrawerOpen
              ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_15px_#22d3ee]'
              : 'bg-black/40 border-white/5 text-slate-500 hover:text-slate-200'
          )}
        >
          <Radar size={20} />
          <span className="text-[6px] font-black mt-1 uppercase tracking-tighter">
            AIS
          </span>
        </button>

        {/* WIND */}
        <button
          onClick={onToggleWind}
          className={cn(
            'w-12 h-12 flex flex-col items-center justify-center rounded-xl transition-all border',
            windEnabled
              ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_15px_#22d3ee]'
              : 'bg-black/40 border-white/5 text-slate-500 hover:text-slate-200'
          )}
        >
          <Wind size={20} />
          <span className="text-[6px] font-black mt-1 uppercase tracking-tighter">
            WIND
          </span>
        </button>

        {/* CPA */}
        <button
          onClick={onToggleCollisionFilter}
          className={cn(
            'w-12 h-12 flex flex-col items-center justify-center rounded-xl transition-all border',
            collisionFilter
              ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_15px_#22d3ee]'
              : 'bg-black/40 border-white/5 text-slate-500 hover:text-slate-200'
          )}
        >
          <Crosshair size={20} />
          <span className="text-[6px] font-black mt-1 uppercase tracking-tighter">
            CPA
          </span>
        </button>

        {/* AUTO */}
<button
  onClick={onToggleAutopilot}
  className={cn(
    'w-12 h-12 flex flex-col items-center justify-center rounded-xl transition-all border',
    autopilotMode !== 'standby'
      ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_15px_#22d3ee]'
      : 'bg-black/40 border-white/5 text-slate-500 hover:text-slate-200'
  )}
>
  <Zap size={20} />
  <span className="text-[6px] font-black mt-1 uppercase tracking-tighter">
    AUTO
  </span>
</button>

<div className="w-8 h-px bg-white/10 my-2" />

<div className="pt-2">
  <button
    className={cn(
      'w-10 h-10 flex items-center justify-center rounded-full border transition-all',
      isNavigating
        ? 'bg-red-950 border-red-500 text-red-500 animate-pulse'
        : 'bg-slate-900 border-slate-700 text-slate-600'
    )}
  >
    <Power size={16} />
  </button>
</div>
      </aside>
    </>
  );
};