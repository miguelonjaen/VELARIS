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
import DockButton from "../dock/DockButton";
import Dock from "../dock/Dock";
import DockSeparator from "../dock/DockSeparator";

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
  {
    id: "chart",
    icon: Map,
    label: "CHART",
    active: activePage === "chart" || isLayersOpen,
  },
  {
    id: "nav",
    label: "NAV",
    icon: Compass,
    active: activePage === "nav",
  },
  {
    id: "sail",
    label: "SAIL",
    icon: Sailboat,
    active: activePage === "sail" || isSailSteerWidgetOpen,
  },
  {
    id: "race",
    label: "RACE",
    icon: Flag,
    active: activePage === "race",
  },
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

     <Dock>

  <button
    onClick={onToggleMenu}
    className="
      w-[66px]
      h-[66px]

      flex
      items-center
      justify-center

      rounded-2xl

      border
      border-white/10

      bg-gradient-to-b
      from-slate-700
      via-slate-800
      to-slate-950

      text-white

      transition-all
      duration-300

      hover:border-cyan-400/40
      hover:text-cyan-300
      hover:shadow-[0_0_20px_rgba(34,211,238,.15)]
      hover:-translate-y-[1px]
    "
  >
    <Menu size={22} />
  </button>

  <DockSeparator />


  {/* Aquí empieza el contenido del Dock */}
                

        {mainButtons.map((btn, index) => (
  <React.Fragment key={btn.id}>

    {index === 3 && (
      <div className="h-px w-8 bg-white/10 my-4 mx-auto" />
    )}

    <DockButton
      icon={btn.icon}
      hoverLabel={btn.label}
      active={btn.active}
      onClick={() => {

        onSelect(btn.id);

        switch (btn.id) {

          case "chart":
            setIsLayersOpen(!isLayersOpen);
            break;

          case "sail": {

            const nextState = !isSailSteerWidgetOpen;

            setIsSailSteerWidgetOpen(nextState);
            setIsLaylinesActive(nextState);

            break;
          }

        }

      }}
    />

  </React.Fragment>
))}

        <div className="relative w-10 h-px my-4">

    <div className="absolute inset-0 bg-white/5"/>

    <div className="absolute inset-x-2 inset-y-0 bg-cyan-400/25 blur-sm"/>

</div>

        {/* AIS */}
        <DockButton
    icon={Radar}
    active={isAISDrawerOpen}
    statusIndicator="green"
    onClick={() => setIsAISDrawerOpen(!isAISDrawerOpen)}
/>

        {/* WIND */}
       <DockButton
    icon={Wind}
    active={windEnabled}
    statusIndicator="cyan"
    onClick={onToggleWind}
/>

        {/* CPA */}
        <DockButton
    icon={Crosshair}
    active={collisionFilter}
    statusIndicator="amber"
    onClick={onToggleCollisionFilter}
/>

        {/* AUTO */}
<DockButton
    icon={Zap}
    active={autopilotMode !== "standby"}
    statusIndicator="blue"
    onClick={onToggleAutopilot}
/>

<div className="relative w-10 h-px my-4">

    <div className="absolute inset-0 bg-white/5"/>

    <div className="absolute inset-x-2 inset-y-0 bg-cyan-400/25 blur-sm"/>

</div>

<div className="pt-1">
  <DockButton
    icon={Power}
    rounded
    danger
    active={true}
     statusIndicator="green"
/>
</div>
      </Dock>
    </>
  );
};