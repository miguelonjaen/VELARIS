import type { InstrumentProvider } from '../../traffic/components/technical/sensorBindings';
import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  Map,
  Compass,
  Sailboat,
  Wind,
  Power,
  Radar,
  Crosshair,
  Route,
  ClipboardList,
  ShipWheel,
  Ship,
} from 'lucide-react';

const RadarPanel = lazy(() => import('../../radar/RadarPanel'));
import { ChartPanel } from '../panels/ChartPanel';
import { ZeusLayerMenu } from '../../../components/ZeusLayerMenu';
import type { AisPanelTarget, CpaOptions, AisReferencePosition } from '../../../features/traffic/aisPanelModel';
import { AISTacticalDrawer } from '../../../AISTacticalDrawer';
import { BoatPanel } from '../../boat/BoatPanel';
import type { BoatPanelInput } from '../../boat/boatPanelModel';
import DockButton from "../dock/DockButton";
import Dock from "../dock/Dock";
import "../dock/compactDock.css";

import type { AISConnectionControls } from '../../traffic/useAISConnections';

interface ZeusSidebarProps {
  aisConnections?: AISConnectionControls;
  activePage: string;
  onPilotControlsHostChange?: (element: HTMLElement | null) => void;
  onWindFlowControlsHostChange?: (element: HTMLElement | null) => void;
  onMarineControlsHostChange?: (element: HTMLElement | null) => void;
  onSelect: (id: string) => void;
  onToggleMenu: () => void;
  onStartNavigation: () => void;
  isNavigating: boolean;
  listaCartas: any[];
  cartasActivas: Record<string, boolean>;
  toggleCarta: (name: string) => void;
  cartasOpacity: Record<string, number>;
  setCartasOpacity: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  activeEncFilename: string | null;
  onToggleEncOverlay: (filename: string | null, bounds?: [number, number, number, number]) => void;
  layersState: any;
  setLayersState: React.Dispatch<React.SetStateAction<any>>;
  aisEnabled: boolean;
  windEnabled: boolean;
  isWeatherPanelOpen: boolean;
  setIsWeatherPanelOpen: (val: boolean) => void;
  isLaylinesActive: boolean;
  isWaypointLaylinesActive?: boolean;
  setIsWaypointLaylinesActive?: (value: boolean) => void;
  setIsLaylinesActive: (val: boolean) => void;
  isSailSteerWidgetOpen: boolean;
  setIsSailSteerWidgetOpen: (val: boolean) => void;
  collisionFilter: boolean;
  autopilotMode: 'standby' | 'auto' | 'wind' | 'nav';
  onToggleAIS: () => void;
  onToggleWind: () => void;
  onToggleCollisionFilter: () => void;
  onToggleAutopilot: () => void;
  aisTargets: AisPanelTarget[];
  aisOwnPosition?: AisReferencePosition | null;
  aisReferenceLabel?: string;
  cpaOptions?: CpaOptions;
  onCpaOptionsChange?: (options: CpaOptions) => void;
  onLocateAis?: (target: AisPanelTarget) => void;
  /** Estado del panel de misión (lo gestiona App: showSystems). */
  isMissionPanelOpen?: boolean;
  isVoyagePanelOpen?: boolean;
  /** Cierra el panel de misión cuando se abre otro panel en el mismo hueco. */
  onCloseMissionPanel?: () => void;
  /** Datos vigentes del panel «Barco» (si no se indica, el botón queda deshabilitado). */
  getBoatPanelInput?: () => BoatPanelInput;
  technicalUserId?: string | null;
  getInstrumentFeed?: InstrumentProvider;
  laylineStatus?: string;
  renderSailingTactics?: (onClose: () => void) => React.ReactNode;
  renderRouteTrial?: (onClose: () => void) => React.ReactNode;
  renderBoatOperations?: (input: BoatPanelInput) => React.ReactNode;
  renderWeather?: () => React.ReactNode;
  className?: string;
}

const AUTOPILOT_LABEL: Record<ZeusSidebarProps['autopilotMode'], string> = {
  standby: 'STBY',
  auto: 'AUTO',
  wind: 'VIENTO',
  nav: 'NAV',
};

/**
 * Barra derecha de herramientas (Zeus). Inventario funcional documentado en
 * docs/GAULOS_UI_FUNCTIONAL_AUDIT.md. Los callbacks y estados son los de App;
 * aquí solo se organiza la presentación y se coordinan los paneles que
 * comparten el mismo hueco (capas, AIS y misión) para que nunca se solapen.
 */
export const ZeusSidebar: React.FC<ZeusSidebarProps> = ({
  activePage,
  onPilotControlsHostChange,
  onWindFlowControlsHostChange,
  onMarineControlsHostChange,
  onSelect,
  onToggleMenu,
  onStartNavigation,
  isNavigating,
  listaCartas,
  cartasActivas,
  toggleCarta,
  aisTargets, aisConnections, aisEnabled, onToggleAIS,
  aisOwnPosition, aisReferenceLabel,
  cpaOptions, onCpaOptionsChange, onLocateAis,
  cartasOpacity,
  setCartasOpacity,
  activeEncFilename,
  onToggleEncOverlay,
  layersState,
  setLayersState,
  windEnabled,
  collisionFilter,
  autopilotMode,
  onToggleWind,
  onToggleCollisionFilter,
  onToggleAutopilot,
  isSailSteerWidgetOpen,
  setIsSailSteerWidgetOpen,
  isLaylinesActive,
  setIsLaylinesActive,
  isWaypointLaylinesActive = false,
  setIsWaypointLaylinesActive,
  isMissionPanelOpen = false,
  isVoyagePanelOpen = false,
  onCloseMissionPanel,
  getBoatPanelInput,
  technicalUserId,
  getInstrumentFeed,
  laylineStatus,
  renderRouteTrial,
  renderSailingTactics,
  renderBoatOperations, renderWeather,
  isWeatherPanelOpen, setIsWeatherPanelOpen,
  className
}) => {
  const [group, setGroup] = useState<'route' | 'sail' | 'ais' | 'meteo' | null>(null);
  const [isRadarOpen, setIsRadarOpen] = useState(false);
  const [aisMode, setAisMode] = useState<'all' | 'risk'>('all');
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const [isWindFlowOpen,setIsWindFlowOpen]=useState(false);
  const [isAISDrawerOpen, setIsAISDrawerOpen] = useState(false);
  const [isBoatPanelOpen, setIsBoatPanelOpen] = useState(false);
  const [isEnergyPanelOpen, setIsEnergyPanelOpen] = useState(false);
  const [isRouteTrialOpen, setIsRouteTrialOpen] = useState(false);
  const [isTacticsOpen, setIsTacticsOpen] = useState(false);

  // Si el panel de misión se abre desde otro punto (p. ej. el asesor), se
  // cierran los paneles que ocupan el mismo hueco.
  useEffect(() => {
    if (isMissionPanelOpen || isVoyagePanelOpen) {
      setGroup(null);
      setIsWeatherPanelOpen(false);
      setIsRadarOpen(false);
      setIsLayersOpen(false);
      setIsWindFlowOpen(false);
      setIsAISDrawerOpen(false);
      setIsBoatPanelOpen(false);
      setIsEnergyPanelOpen(false);
      setIsRouteTrialOpen(false);
      setIsTacticsOpen(false);
    }
  }, [isMissionPanelOpen, isVoyagePanelOpen]);

  // El panel de capas pertenece a la carta: se cierra al salir de ella.
  useEffect(() => {
    if (activePage !== 'chart') { setIsLayersOpen(false); setIsWindFlowOpen(false); }
  }, [activePage]);

  // Capas, AIS, Barco y misión comparten el mismo hueco: abrir uno cierra los demás.
  const openExclusive = (panel: 'radar' | 'layers' | 'ais' | 'boat' | 'trial' | 'windflow' | 'energy' | 'tactics', next: boolean) => {
    if (next) { setGroup(null); setIsWeatherPanelOpen(false); }
    if (next && (isMissionPanelOpen || isVoyagePanelOpen)) onCloseMissionPanel?.();
    setIsRadarOpen(panel === 'radar' ? next : next ? false : isRadarOpen);
    setIsLayersOpen(panel === 'layers' ? next : next ? false : isLayersOpen);
    setIsWindFlowOpen(panel === 'windflow' ? next : next ? false : isWindFlowOpen);
    setIsAISDrawerOpen(panel === 'ais' ? next : next ? false : isAISDrawerOpen);
    setIsBoatPanelOpen(panel === 'boat' ? next : next ? false : isBoatPanelOpen);
    setIsEnergyPanelOpen(panel === 'energy' ? next : next ? false : isEnergyPanelOpen);
    setIsRouteTrialOpen(panel === 'trial' ? next : next ? false : isRouteTrialOpen);
    setIsTacticsOpen(panel === 'tactics' ? next : next ? false : isTacticsOpen);
  };

  const handlePage = (id: 'chart' | 'nav' | 'sail' | 'race') => {
    // Segunda pulsación sobre NAV / SAIL / RACE: vuelve a la carta.
    if ((id === 'nav' || id === 'sail' || id === 'race') && activePage === id) {
      if (id === 'sail') {
        // Al salir de SAIL se cierra también su HUD, para que el estado
        // visible coincida con la pantalla seleccionada.
        setIsSailSteerWidgetOpen(false);
        setIsLaylinesActive(false);
      }
      setGroup(null); onSelect('chart');
      return;
    }

    setGroup(null);
    onSelect(id);

    switch (id) {
      case 'chart':
        openExclusive('layers', !isLayersOpen);
        break;
      case 'sail': {
        const nextState = !isSailSteerWidgetOpen;
        setIsSailSteerWidgetOpen(nextState);
        // Opening the HUD never activates chart laylines.
        break;
      }
      default:
        break;
    }
  };

  const handleMission = () => {
    openExclusive('boat', false);
    setGroup(null); setIsRadarOpen(false); setIsRouteTrialOpen(false); setIsWeatherPanelOpen(false);
    setIsTacticsOpen(false);
    if (!isMissionPanelOpen) {
      setIsLayersOpen(false);
      setIsWindFlowOpen(false);
      setIsAISDrawerOpen(false);
      setIsBoatPanelOpen(false);
      setIsEnergyPanelOpen(false);
    }
    onToggleMenu();
  };

  const toggleGroup = (next: 'route' | 'sail' | 'ais' | 'meteo') => {
    const closing = group === next || (next === 'route' && (isMissionPanelOpen || isVoyagePanelOpen || isRouteTrialOpen)) || (next === 'ais' && (isAISDrawerOpen || isRadarOpen)) || (next === 'sail' && isTacticsOpen) || (next === 'meteo' && isWindFlowOpen);
    openExclusive('boat', true);
    setIsBoatPanelOpen(false);
    onSelect('chart');
    setGroup(closing ? null : next);
    setIsWeatherPanelOpen(!closing && next === 'meteo');
  };
  return (
    <>
      {isRadarOpen && <Suspense fallback={<ChartPanel isOpen onClose={() => setIsRadarOpen(false)} title="RADAR · SIMULACIÓN"><p role="status">Cargando laboratorio SIM…</p></ChartPanel>}><RadarPanel onClose={() => setIsRadarOpen(false)} /></Suspense>}
      {isLayersOpen && <div className="absolute right-[var(--vl-dock-reserve)] bottom-2 z-(--vl-z-panel)"><button className="min-h-11 rounded bg-slate-900 px-3 text-xs text-cyan-200" type="button" onClick={() => openExclusive('windflow', true)}>WindFlow · controles del overlay</button></div>}
      <ZeusLayerMenu
        isOpen={isLayersOpen}
        onPilotControlsHostChange={onPilotControlsHostChange}
        onMarineControlsHostChange={onMarineControlsHostChange}
        onClose={() => setIsLayersOpen(false)}
        layersState={layersState}
        setLayersState={setLayersState}
        listaCartas={listaCartas}
        cartasActivas={cartasActivas}
        toggleCarta={toggleCarta}
        cartasOpacity={cartasOpacity}
        setCartasOpacity={setCartasOpacity}
        activeEncFilename={activeEncFilename}
        onToggleEncOverlay={onToggleEncOverlay}
      />

      <ChartPanel isOpen={isWindFlowOpen} onClose={() => setIsWindFlowOpen(false)} title="WindFlow" icon={Wind} width={350} ariaLabel="WindFlow · pronóstico de viento">
        <div className="space-y-3 p-3">
          <label className="flex items-center gap-2 text-xs text-slate-200">
            <input type="checkbox" checked={windEnabled} onChange={onToggleWind} />Mostrar WindFlow sobre la carta
          </label>
          {!windEnabled && <p className="text-xs text-slate-400">Activa la capa para consultar el pronóstico y ajustar sus controles.</p>}
          <div ref={onWindFlowControlsHostChange} />
        </div>
      </ChartPanel>

      <AISTacticalDrawer
        isOpen={isAISDrawerOpen}
        targets={aisTargets}
        connections={aisConnections}
        targetsVisible={aisEnabled}
        onToggleTargets={onToggleAIS}
        ownPosition={aisOwnPosition}
        referenceLabel={aisReferenceLabel}
        mode={aisMode}
        options={cpaOptions}
        onOptionsChange={onCpaOptionsChange}
        onLocate={onLocateAis}
        onClose={() => setIsAISDrawerOpen(false)}
      />

      {getBoatPanelInput && (
        <BoatPanel
          isOpen={isBoatPanelOpen}
          onClose={() => setIsBoatPanelOpen(false)}
          getInput={getBoatPanelInput}
          operations={isBoatPanelOpen ? input => <>{renderBoatOperations?.(input)}<details className="bs-details"><summary>Piloto · indicación visual, sin mando físico</summary><DockButton
          icon={ShipWheel}
          label={AUTOPILOT_LABEL[autopilotMode]}
          kind="action"
          tooltip={`Modo de piloto: ${AUTOPILOT_LABEL[autopilotMode]}`}
          tooltipDetail="Alterna STBY › AUTO › VIENTO › NAV. Indicación visual: no envía órdenes al piloto automático."
          active={autopilotMode !== 'standby'}
          statusIndicator="blue"
          onClick={onToggleAutopilot}
        /></details></> : undefined}
          technicalUserId={technicalUserId}
          getInstrumentFeed={getInstrumentFeed}
          onOpenSailingTactics={renderSailingTactics ? () => openExclusive('tactics', true) : undefined}
        />
      )}

      {getBoatPanelInput && <BoatPanel isOpen={isEnergyPanelOpen} electricalOnly technicalUserId={technicalUserId} getInstrumentFeed={getInstrumentFeed} onClose={() => setIsEnergyPanelOpen(false)} getInput={getBoatPanelInput} />}
      {isTacticsOpen && renderSailingTactics?.(() => setIsTacticsOpen(false))}
      {isRouteTrialOpen && renderRouteTrial?.(() => setIsRouteTrialOpen(false))}
      <ChartPanel isOpen={group !== null} onClose={() => { setGroup(null); setIsWeatherPanelOpen(false); }} title={group === 'route' ? 'RUTA · travesía, rutas, waypoints y misión' : group === 'sail' ? 'VELA · táctica' : group === 'ais' ? 'AIS · objetivos y riesgos' : 'METEO'} width={360}>
        <div className="grid grid-cols-2 gap-2 p-3 [&_button]:min-h-12 [&_button]:w-full">
          {group === 'route' && <><DockButton
          icon={Compass}
          label="Nav"
          kind="page"
          tooltip="Pantalla de navegación"
          tooltipDetail="Vista de navegación a pantalla completa. Pulsa de nuevo para volver a la carta."
          active={activePage === 'nav'}
          onClick={() => handlePage('nav')}
        />
<DockButton
          icon={ClipboardList}
          label="Misión"
          kind="panel"
          tooltip="Planificación de misión"
          tooltipDetail="Planes, versiones, alternativas y revisión de la derrota antes de iniciar la travesía."
          active={isMissionPanelOpen}
          onClick={handleMission}
        />
<DockButton
          icon={Route}
          label="Travesía"
          kind="action"
          tooltip="Seguimiento de travesía"
          tooltipDetail="Estado, track, distancia GPS, guardia y bitácora. Permite preparar o finalizar la travesía."
          active={isVoyagePanelOpen}
          statusIndicator="green"
          onClick={onStartNavigation}
        />
{renderRouteTrial && <DockButton icon={Route} label="Ensayo" kind="panel" active={isRouteTrialOpen}
          tooltip="Ensayo de ruta" tooltipDetail="Definir waypoints y recorrerlos virtualmente con SOG NMEA. No gobierna el barco."
          onClick={() => openExclusive('trial', !isRouteTrialOpen)} />}</>}
          {group === 'sail' && <><DockButton
          icon={Sailboat}
          label="Vela"
          kind="page"
          tooltip="SailSteer"
          tooltipDetail={laylineStatus ?? "Rosa discreta, rumbo, viento y dirección al waypoint. Pulsa de nuevo para cerrarlo."}
          active={activePage === 'sail' || isSailSteerWidgetOpen}
          onClick={() => handlePage('sail')}
        />
<DockButton
          icon={Sailboat}
          label="Laylines"
          kind="panel"
          tooltip="Laylines desde el barco"
          tooltipDetail={(laylineStatus ?? 'Requiere waypoint, polar y viento válidos') + ' · Aproximación sin corriente ni abatimiento'}
          active={isLaylinesActive}
          onClick={() => setIsLaylinesActive(!isLaylinesActive)}
        />
{setIsWaypointLaylinesActive && <DockButton
          icon={Route}
          label="Laylines WP"
          kind="panel"
          tooltip="Laylines del waypoint · opcionales"
          tooltipDetail={(laylineStatus ?? 'Requiere waypoint, polar y viento NMEA vigentes') + ' · Aproximación estimada, sin corriente ni abatimiento. Desactivadas por defecto.'}
          active={isWaypointLaylinesActive}
          onClick={() => setIsWaypointLaylinesActive(!isWaypointLaylinesActive)}
        />}
{renderSailingTactics && <DockButton icon={Compass} label="Táctica" kind="panel" tooltip="Navegación / Instrumentos / Táctica de vela" tooltipDetail="Rosa de gobierno, viento medido, waypoint y polar. Permite ampliar a pantalla completa." active={isTacticsOpen} onClick={() => { onSelect('chart'); openExclusive('tactics', !isTacticsOpen); }} />}<p className="col-span-2 text-xs text-slate-400">{laylineStatus}</p></>}
          {group === 'ais' && <><DockButton
          icon={Radar}
          label="AIS"
          kind="panel"
          tooltip="Conexiones y objetivos AIS"
          tooltipDetail={`${aisTargets.length} objetivos, ordenados por riesgo y CPA. La capa AIS se activa en Carta › Capas.`}
          active={isAISDrawerOpen}
          onClick={() => { setAisMode('all'); openExclusive('ais', !isAISDrawerOpen || aisMode !== 'all'); }}
        />
<DockButton
          icon={Crosshair}
          label="CPA"
          kind="panel"
          tooltip="Análisis CPA/TCPA"
          tooltipDetail="Riesgo y anillo de seguridad compartido con las alarmas; selección y localización de objetivos."
          active={isAISDrawerOpen && aisMode === 'risk'}
          statusIndicator="amber"
          onClick={() => { setAisMode('risk'); openExclusive('ais', !isAISDrawerOpen || aisMode !== 'risk'); }}
        />
<DockButton icon={Radar} label="Radar SIM" kind="panel" tooltip="Laboratorio RADAR · SIMULACIÓN" tooltipDetail="Ecos sintéticos aislados de navegación y alarmas" active={isRadarOpen} onClick={() => openExclusive('radar', !isRadarOpen)} /><button type="button" aria-pressed={collisionFilter} onClick={onToggleCollisionFilter}>Filtro CPA/TCPA: {collisionFilter ? 'sí' : 'no'}</button></>}
          {group === 'meteo' && <><div className="col-span-2 [&>*]:!static [&>*]:!w-full">{renderWeather?.()}</div><DockButton
          icon={Wind}
          label="WindFlow"
          className="[&>span:first-of-type]:normal-case [&>span:first-of-type]:tracking-normal"
          kind="panel"
          tooltip="WindFlow · pronóstico de viento"
          tooltipDetail="Abre los controles del pronóstico sobre la carta. Cerrar el panel conserva la capa."
          active={isWindFlowOpen}
          onClick={() => { onSelect('chart'); openExclusive('windflow', !isWindFlowOpen); }}
        /></>}
        </div>
      </ChartPanel>
      <Dock className={className}>
        <DockButton
          icon={Ship}
          label="Barco"
          kind="panel"
          tooltip="Panel del barco"
          tooltipDetail="Navegación, motor, depósitos, electricidad y seguridad, con la fuente y antigüedad de cada lectura."
          active={isBoatPanelOpen}
          disabled={!getBoatPanelInput}
          onClick={() => { onSelect('chart'); openExclusive('boat', !isBoatPanelOpen); }}
        />
        <DockButton icon={Route} label="RUTA" kind="panel" tooltip="Travesía, rutas, waypoints y misión" active={group === 'route' || isMissionPanelOpen || isVoyagePanelOpen || isRouteTrialOpen} onClick={() => toggleGroup('route')} />
        <DockButton icon={Radar} label="AIS" kind="panel" tooltip="Objetivos, riesgos CPA/TCPA y laboratorio radar" active={group === 'ais' || isAISDrawerOpen || isRadarOpen} onClick={() => toggleGroup('ais')} />
        <DockButton icon={Sailboat} label="VELA" kind="panel" tooltip="Táctica, instrumentos y laylines" active={group === 'sail' || isTacticsOpen} onClick={() => toggleGroup('sail')} />
        <DockButton icon={Wind} label="METEO" kind="panel" tooltip="Meteorología y previsión de viento" active={group === 'meteo' || isWindFlowOpen} onClick={() => toggleGroup('meteo')} />
        <DockButton
          icon={Map}
          label="CAPAS"
          kind="page"
          tooltip="Carta náutica y capas"
          tooltipDetail="Vuelve a la carta y abre o cierra el panel de capas."
          active={isLayersOpen}
          onClick={() => handlePage('chart')}
        />
      </Dock>
    </>
  );
};
