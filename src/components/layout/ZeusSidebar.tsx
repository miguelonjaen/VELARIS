import React, { useState } from 'react';
import { cn } from '../../lib/utils';
import { Map, Compass, Sailboat, Flag, Wind, Menu, Power, Radar, Crosshair, Zap, Target } from 'lucide-react';
import { ZeusLayerMenu } from '../ZeusLayerMenu';

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
  aisEnabled: boolean; // New prop
  windEnabled: boolean; // New prop
  isWeatherPanelOpen: boolean; // New prop
  setIsWeatherPanelOpen: (val: boolean) => void; // New prop
  isLaylinesActive: boolean; // New prop
  setIsLaylinesActive: (val: boolean) => void; // New prop
  isSailSteerWidgetOpen: boolean; // New prop
  setIsSailSteerWidgetOpen: (val: boolean) => void; // New prop
  collisionFilter: boolean; // New prop
  autopilotMode: 'standby' | 'auto' | 'wind' | 'nav'; // New prop
  onToggleAIS: () => void; // New prop
  onToggleWind: () => void; // New prop
  onToggleCollisionFilter: () => void; // New prop
  onToggleAutopilot: () => void; // New prop
  className?: string;
}

export const ZeusSidebar: React.FC<ZeusSidebarProps> = ({
  activePage, onSelect, onToggleMenu, isNavigating,
  listaCartas, cartasActivas, toggleCarta,
  cartasOpacity, setCartasOpacity,
  layersState, setLayersState,
  aisEnabled, windEnabled, collisionFilter, autopilotMode,
  onToggleAIS, onToggleWind, onToggleCollisionFilter, onToggleAutopilot,
  isWeatherPanelOpen, setIsWeatherPanelOpen,
  isLaylinesActive, setIsLaylinesActive,
  isSailSteerWidgetOpen, setIsSailSteerWidgetOpen,
  className 
}) => {
  const [isLayersOpen, setIsLayersOpen] = useState(false);

  const buttons = [
    { id: 'chart', icon: Map, label: 'CHART', onClick: () => setIsLayersOpen(!isLayersOpen) },
    { id: 'nav', icon: Compass, label: 'NAV', onClick: () => onSelect('nav') },
    { id: 'sail', icon: Sailboat, label: 'SAIL', onClick: () => setIsLaylinesActive(!isLaylinesActive) }, // Toggles Laylines
    { id: 'sailsteer', icon: Target, label: 'INST', onClick: () => setIsSailSteerWidgetOpen(!isSailSteerWidgetOpen) }, // New button for SailSteer Widget
    { id: 'weather', icon: Wind, label: 'METEO', onClick: () => setIsWeatherPanelOpen(!isWeatherPanelOpen) }, // Toggles Weather Panel
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
        // Pass AIS/Wind/CPA states to ZeusLayerMenu for display
        
      />

    <aside className={cn(
      "absolute right-4 top-1/2 -translate-y-1/2 w-16 bg-[#050607]/90 backdrop-blur-xl border border-white/10 rounded-[24px] py-4 flex flex-col items-center gap-4 z-[7000] shadow-2xl",
      className
    )}>
      <button onClick={onToggleMenu} className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-slate-300">
        <Menu size={20} />
      </button>
      <div className="w-8 h-px bg-white/10 my-2" />
      {buttons.map(btn => (
        <button
          key={btn.id}
          onClick={() => {
            onSelect(btn.id);
            // Handle specific button clicks
            if (btn.id === 'chart') setIsLayersOpen(!isLayersOpen);
            if (btn.id === 'sail') setIsLaylinesActive(!isLaylinesActive);
            if (btn.id === 'sailsteer') setIsSailSteerWidgetOpen(!isSailSteerWidgetOpen);
            if (btn.id === 'weather') setIsWeatherPanelOpen(!isWeatherPanelOpen);
          }}
          className={cn(
            "w-12 h-12 flex flex-col items-center justify-center rounded-xl transition-all border",
            (activePage === btn.id || (btn.id === 'chart' && isLayersOpen))
              ? "bg-cyan-600 border-cyan-400 text-white shadow-[0_0_15px_#22d3ee]" 
              : "bg-black/40 border-white/5 text-slate-500 hover:text-slate-200"
          )}
          // Highlight if associated panel/widget is open
          style={{
            ...(btn.id === 'chart' && isLayersOpen && { backgroundColor: '#06b6d4', borderColor: '#22d3ee', color: 'white' }),
            ...(btn.id === 'sail' && isLaylinesActive && { backgroundColor: '#06b6d4', borderColor: '#22d3ee', color: 'white' }),
            ...(btn.id === 'sailsteer' && isSailSteerWidgetOpen && { backgroundColor: '#06b6d4', borderColor: '#22d3ee', color: 'white' }),
            ...(btn.id === 'weather' && isWeatherPanelOpen && { backgroundColor: '#06b6d4', borderColor: '#22d3ee', color: 'white' }),
          }}
        >
          <btn.icon size={20} />
          <span className="text-[6px] font-black mt-1 uppercase tracking-tighter">{btn.label}</span>
        </button>
      ))}

        {/* Separator */}
        <div className="w-8 h-px bg-white/10 my-2" />

        {/* Secondary Controls: AIS, Wind, CPA, Auto */}
        {[
          { id: 'ais', icon: Radar, label: 'AIS', active: aisEnabled, onClick: onToggleAIS },
          { id: 'wind', icon: Wind, label: 'WIND', active: windEnabled, onClick: onToggleWind },
          { id: 'cpa', icon: Crosshair, label: 'CPA', active: collisionFilter, onClick: onToggleCollisionFilter },
          { id: 'auto', icon: Zap, label: 'AUTO', active: autopilotMode !== 'standby', onClick: onToggleAutopilot },
        ].map(ctrl => (
          <button
            key={ctrl.id}
            onClick={() => {
              // Ensure main page selection is not affected by these toggles
              // onSelect(activePage); // Keep current activePage selected
              ctrl.onClick();
            }}
            className={cn(
              "w-12 h-12 flex flex-col items-center justify-center rounded-xl transition-all border",
              ctrl.active
                ? "bg-cyan-600 border-cyan-400 text-white shadow-[0_0_15px_#22d3ee]"
                : "bg-black/40 border-white/5 text-slate-500 hover:text-slate-200"
            )}
          >
            <ctrl.icon size={20} />
            <span className="text-[6px] font-black mt-1 uppercase tracking-tighter">{ctrl.label}</span>
          </button>
        ))}

        {/* Separator */}
        <div className="w-8 h-px bg-white/10 my-2" />

      <div className="mt-auto pt-4">
        <button className={cn(
          "w-10 h-10 flex items-center justify-center rounded-full border transition-all",
          isNavigating ? "bg-red-950 border-red-500 text-red-500 animate-pulse" : "bg-slate-900 border-slate-700 text-slate-600"
        )}>
          <Power size={16} />
        </button>
      </div>
    </aside>
    </>
  );
};
