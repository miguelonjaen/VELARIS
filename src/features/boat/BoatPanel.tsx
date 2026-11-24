import type { InstrumentProvider } from '../traffic/components/technical/sensorBindings';
import { EngineOverview } from './EngineOverview';
import { TankOverview } from './TankOverview';
import React, { useEffect, useState } from 'react';
import { Ship, BatteryCharging, Droplets, Gauge, Zap } from 'lucide-react';
import { ChartPanel } from '../layout/panels/ChartPanel';
import { buildBoatPanelModel, type BoatPanelInput, type BoatPanelRow, type BoatPanelSection } from './boatPanelModel';
import { BOAT_TABS, type BoatTab } from './boatVisualModel';
import './boatSystems.css';

export interface BoatPanelProps {
  isOpen: boolean;
  operations?: (input: BoatPanelInput) => React.ReactNode;
  electricalOnly?: boolean;
  technicalUserId?: string | null;
  getInstrumentFeed?: InstrumentProvider;
  onClose: () => void;
  getInput: () => BoatPanelInput;
  onOpenSailingTactics?: () => void;
}
const STATUS_CLASS: Record<BoatPanelRow['status'], string> = {
  ok: 'text-white', info: 'text-sky-300', missing: 'text-slate-400 italic',
  warning: 'text-amber-300', critical: 'text-rose-400 font-bold',
};
function Rows({ section }: { section: BoatPanelSection }) {
  return <section className="bs-details"><h3>{section.title}</h3><dl>
    {section.rows.map((row, i) => <div key={`${row.label}-${i}`}><dt>{row.label}</dt><dd>
      <span className={STATUS_CLASS[row.status]}>{row.value}</span>
      {(row.source || row.age) && <small>{[row.source, row.age].filter(Boolean).join(' · ')}</small>}
    </dd></div>)}
  </dl></section>;
}
export const BoatPanel: React.FC<BoatPanelProps> = ({ isOpen, onClose, getInput, electricalOnly = false, onOpenSailingTactics, operations }) => {
  const [, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState<BoatTab>('general');
  const input = isOpen ? getInput() : null;
  useEffect(() => {
    if (!isOpen) return;
    const interval = window.setInterval(() => setTick(t => t + 1), 1000);
    return () => window.clearInterval(interval);
  }, [isOpen]);
  const selected = electricalOnly ? 'electrical' : activeTab;
  const sections = input ? buildBoatPanelModel(input) : [];
  return <ChartPanel isOpen={isOpen} onClose={onClose} title={electricalOnly ? 'Energía' : 'BARCO · Centro de Control'} icon={electricalOnly ? BatteryCharging : Ship} width={420} ariaLabel={electricalOnly ? 'Panel de energía' : 'Panel del barco'}>
    {input && <div className={`boat-systems ${selected === 'tanks' ? 'bs-tanks-view' : selected === 'electrical' ? 'bs-electrical-view' : selected === 'engine' ? 'bs-engine-view' : ''}`}>
      {!electricalOnly && <div role="tablist" aria-label="Sistemas del barco" className="bs-tabs">
        {BOAT_TABS.map(tab => <button key={tab.id} type="button" role="tab" id={`boat-tab-${tab.id}`} aria-controls={`boat-panel-${tab.id}`} aria-selected={selected === tab.id} onClick={() => setActiveTab(tab.id)}>{React.createElement(({ general: Ship, tanks: Droplets, electrical: Zap, engine: Gauge })[tab.id], {size:14})}{tab.label}</button>)}
      </div>}
      <div className="bs-provenance">Sistemas: instrumentos del barco · solo lecturas vigentes. Navegación: fuente indicada por lectura.</div>
      {input.navigation.position.source === 'SIMULATOR' && <p className="bs-notice">Navegación simulada · no representa sensores físicos.</p>}
      {input.alarms.length > 0 && <div role="status" className="bs-alarm">{input.alarms.map((alarm, index) => <p key={index} className={alarm.severity === 'critical' ? 'text-rose-300' : 'text-amber-200'}>{alarm.message}</p>)}</div>}
      {selected === 'general' && operations?.(input)}
      <section role="tabpanel" id={`boat-panel-${selected}`} aria-label={electricalOnly ? 'Electricidad' : undefined} aria-labelledby={electricalOnly ? undefined : `boat-tab-${selected}`}>
        {selected === 'general' && <>
          {onOpenSailingTactics && <button type="button" onClick={onOpenSailingTactics} className="my-3 min-h-11 rounded-lg border border-cyan-800 bg-cyan-950 px-4 text-cyan-100">Abrir Instrumentos · Táctica de vela ↗</button>}

        </>}
        {(selected === 'tanks' || selected === 'electrical') && <>
          {selected === 'tanks' ? <TankOverview instruments={input.instruments}/> : sections.filter(section => section.id === 'electrical').map(section => <Rows key={section.id} section={section}/>)}
          <p className="bs-caption">Configuración, inventario y esquemas de instalación: Operaciones de Flota.</p>
        </>}
        {selected === 'engine' && <EngineOverview key={input.vesselId ?? 'unassigned'} instruments={input.instruments}/>}
        {sections.filter(section => selected === 'general' ? section.id === 'navigation' || section.id === 'safety' : selected !== 'electrical' && section.id === selected).map(section => selected !== 'general' ? <details className="tk-details" key={section.id}><summary>Detalle de lecturas y procedencia</summary><Rows section={section}/></details> : <details className="bs-details" key={section.id}><summary className="min-h-11 cursor-pointer p-3">{section.title}</summary><Rows section={section}/></details>)}
      </section>
    </div>}
  </ChartPanel>;
};
export default BoatPanel;
