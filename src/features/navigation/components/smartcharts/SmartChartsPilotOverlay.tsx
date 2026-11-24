import TacticalChartQueries from './AreaAnalysisControl';
import type { CopilotContext } from '../../../copilot/context';
import React, { useEffect, useMemo, useState, useCallback, lazy, Suspense } from 'react';
import { GeoJSON, Pane, useMap } from 'react-leaflet';
import L from 'leaflet';
import { createPortal } from 'react-dom';
import type { FeatureCollection, LineString, MultiLineString, Polygon } from 'geojson';
import catalog from './mediterranean/catalog.json';
import motrilPilot from './motril-pilot.json';
import { parseBathymetryAtlas, loadBathymetrySector, type RegionalBathymetryChart, type BathymetrySector } from './bathymetry-atlas-contract';
import fineCatalog from './relief/fine-catalog.json';
import bathymetryCatalog from './bathymetry/catalog.json';
import baseCatalog from './mediterranean/base-catalog.json';
import { loadSurfaceSector } from './surface-contract';

import { selectViewportBathymetry } from './viewport-bathymetry';
import SeamarkLayer from './SeamarkLayer';
import type { OfflineSeamarkStatus } from './OfflineSeamarkLayer';
import offlineSeamarkCatalog from './seamarks-offline/catalog.json';
const OfflineSeamarkLayer = lazy(() => import('./OfflineSeamarkLayer'));
import { readBrowserNauticalPreferences, saveNauticalPreferences, resolveNauticalDisplay } from './nautical-preferences';
import localNauticalCatalog from './nautical/catalog.json';
const LocalNauticalLayer=lazy(()=>import('./LocalNauticalLayer'));
import ContourDepthLabels from './ContourDepthLabels';
import { DEFAULT_RELIEF, type ReliefSettings } from './relief-model';
import { readBrowserBathymetryPreferences, saveBathymetryPreferences } from './layer-preferences';
const ReliefLayer = lazy(() => import('./ReliefLayer'));

interface CoastalSector {
  id: string; label: string; bbox: [number, number, number, number]; simplified: boolean; resources: string[];
}
type CoastalCollection = FeatureCollection<LineString | MultiLineString, { kind: string }>;
const sectors = catalog.sectors as unknown as CoastalSector[];
const loaders = import.meta.glob<CoastalCollection>('./mediterranean/sector-*.json', { import: 'default' });
type SurfaceId = 'sea' | 'land' | 'inlandWater';
interface BaseSector { id: string; schemaVersion: number; navigationUse: false; depthKnown: false; layers: Record<SurfaceId, FeatureCollection<Polygon>> }
const baseLoaders = import.meta.glob<unknown>('./mediterranean/base/*.json', { import: 'default' });
const definitions = baseCatalog.layerDefinitions as { id: SurfaceId; label: string; color: string; order: number }[];
const surfaceStyles = Object.fromEntries(definitions.map(d => [d.id, {
  fillColor: d.color, fillOpacity: 1, stroke: true, color: d.color,
  weight: 0.6, lineJoin: 'round' as const
}])) as Record<SurfaceId, L.PathOptions>;
const contextStyles = Object.fromEntries(definitions.map(d => [d.id, {
  fillColor: d.color, fillOpacity: 1, stroke: false
}])) as Record<SurfaceId, L.PathOptions>;
const coastlineStyle = (feature?: GeoJSON.Feature): L.PathOptions => ({
  color: feature?.properties?.kind === 'coastline' ? '#fbbf24' : '#f472b6', weight: 2, opacity: 1
});
const bathymetryLoaders = import.meta.glob<unknown>('./bathymetry/contours-*.json', { import: 'default' });
// An unavailable optional atlas must never prevent the navigation application from starting.
const fineSector = fineCatalog as unknown as BathymetrySector;
const bathymetrySectors = (() => {
  try { return parseBathymetryAtlas(bathymetryCatalog).sectors; }
  catch (error: unknown) { console.error('[SmartCHARTS] Catalogo batimetrico no disponible', error); return []; }
})();
function SmartChartsPilotOverlay({ onPrincipalChange, controlsHost = null, encFilename, getCopilotContext }: { onPrincipalChange?: (enabled: boolean) => void; controlsHost?: HTMLElement | null; encFilename?: string; getCopilotContext?: () => CopilotContext }): React.ReactElement {
  const map = useMap();
  const [nauticalPreferences, setNauticalPreferences] = useState(readBrowserNauticalPreferences);
  const seamarksEnabled = nauticalPreferences.source === 'openseamap';
  const localNauticalEnabled = nauticalPreferences.source === 'local';
  const offlineSeamarksEnabled = nauticalPreferences.source === 'offline';
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine);
  const [offlineSeamarkStatus, setOfflineSeamarkStatus] = useState<OfflineSeamarkStatus>('loading');
  const [nauticalPreferencesSaved, setNauticalPreferencesSaved] = useState(true);
  useEffect(() => {
    setNauticalPreferencesSaved(saveNauticalPreferences(nauticalPreferences));
  }, [nauticalPreferences]);

  const [localNauticalStatus,setLocalNauticalStatus]=useState('Cargando catálogo local…');
  const [seamarksLoading,setSeamarksLoading]=useState(false);
  const [seamarksError,setSeamarksError]=useState(false);
  const showOfflineSeamarks = resolveNauticalDisplay(nauticalPreferences.source, networkOnline, seamarksError) === 'offline';
  useEffect(() => {
    const online = (): void => { setNetworkOnline(true); setSeamarksError(false); };
    const offline = (): void => setNetworkOnline(false);
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);
  const seamarksStart=useCallback(()=>{setSeamarksLoading(true);setSeamarksError(false);},[]);
  const seamarksReady=useCallback(()=>setSeamarksLoading(false),[]);
  const seamarksFailed=useCallback(()=>setSeamarksError(true),[]);
  const [layerPreferences, setLayerPreferences] = useState(readBrowserBathymetryPreferences);
  const { reliefEnabled, bathymetryEnabled } = layerPreferences;
  const [preferencesSaved, setPreferencesSaved] = useState(true);
  useEffect(() => {
    setPreferencesSaved(saveBathymetryPreferences(layerPreferences));
  }, [layerPreferences]);
  const [reliefSettings, setReliefSettings] = useState<ReliefSettings>(DEFAULT_RELIEF);
  const [reliefOpacity, setReliefOpacity] = useState(0.85);
  const [reliefStatus, setReliefStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const reportRelief = useCallback((state: 'loading' | 'ready' | 'error') => setReliefStatus(state), []);
  const [enabled, setEnabled] = useState(true);
  const [motrilEnabled, setMotrilEnabled] = useState(false);
  const [depthLabelsEnabled,setDepthLabelsEnabled]=useState(true);

  const [bathymetrySectorId, setBathymetrySectorId] = useState('overview');
  const selectedBathymetry = bathymetrySectors.find(sector => sector.id === bathymetrySectorId) ?? bathymetrySectors[0];
  const bathymetryRenderer = useMemo(() => L.canvas({ padding: 0.2, pane: 'smartcharts-bathymetry' }), []);
  const bathymetryStyle = useMemo<L.PathOptions>(() => ({ renderer: bathymetryRenderer, color: '#7dd3fc', weight: 1.3, opacity: 0.95 }), [bathymetryRenderer]);
  const [automaticBathymetry, setAutomaticBathymetry] = useState(true);
  const [viewport, setViewport] = useState(() => { const b=map.getBounds(); return { bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] as [number,number,number,number], zoom:map.getZoom() }; });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = (): void => { clearTimeout(timer); timer=setTimeout(() => { const b=map.getBounds(); setViewport({ bbox:[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()], zoom:map.getZoom() }); },120); };
    map.on('moveend zoomend',update);
    return () => { clearTimeout(timer); map.off('moveend zoomend',update); };
  },[map]);
  const requestedBathymetry = useMemo(() => {
    const result=automaticBathymetry ? selectViewportBathymetry(bathymetrySectors,viewport.bbox,viewport.zoom) : selectedBathymetry ? [selectedBathymetry] : [];
    const [w,s,e,n]=viewport.bbox;
    if(automaticBathymetry && viewport.zoom>=10 && w<fineSector.bbox[2] && e>fineSector.bbox[0] && s<fineSector.bbox[3] && n>fineSector.bbox[1]) return [...result,fineSector];
    return result;
  },[automaticBathymetry,viewport,selectedBathymetry]);
  const [bathymetryCharts, setBathymetryCharts] = useState<RegionalBathymetryChart[]>([]);
  const [bathymetryError, setBathymetryError] = useState(false);
  const activeKey=requestedBathymetry.map(s=>s.id).join(':');
  // The immutable sector IDs drive loads; moving inside one sector must not reload geometry.
  const activeBathymetry=useMemo(()=>activeKey.split(':').map(id=>id===fineSector.id ? fineSector : bathymetrySectors.find(s=>s.id===id)).filter((s):s is BathymetrySector=>!!s),[activeKey]);
  const [loadedKey,setLoadedKey]=useState('');
  useEffect(() => {
    if (!bathymetryEnabled) return;
    let cancelled=false;
    setBathymetryCharts([]); setLoadedKey(''); setBathymetryError(false);
    const read = (filename: string): Promise<unknown> => {
      const loader=bathymetryLoaders[`./bathymetry/${filename}`];
      return loader ? loader() : Promise.reject(new Error('Missing local bathymetry resource'));
    };
    const load = async (): Promise<RegionalBathymetryChart[]> => {
      const result: RegionalBathymetryChart[]=[]; let vertices=0;
      for (const sector of activeBathymetry) {
        if(cancelled) return [];
        const chart=await loadBathymetrySector(sector,read,sector.id==='alboran-fine' ? fineCatalog.levelsM : undefined);
        vertices+=chart.features.reduce((sum,f)=>sum+f.geometry.coordinates.length,0);
        if(vertices>1_200_000) throw new Error('Visible bathymetry exceeds display budget');
        result.push(chart);
      }
      return result;
    };
    load().then(charts=>{ if(!cancelled) { setBathymetryCharts(charts); setLoadedKey(activeKey); } }).catch((error:unknown)=>{if(!cancelled) {setBathymetryError(true); console.error('[SmartCHARTS] Isobatas no disponibles',error);}});
    return ()=>{cancelled=true;};
  },[bathymetryEnabled,activeBathymetry,activeKey]);
  const [overviewBase,setOverviewBase]=useState<BaseSector | null>(null);
  useEffect(()=>{
    if(!enabled) return;
    let cancelled=false;
    const read=(filename:string):Promise<unknown>=>{
      const loader=baseLoaders[`./mediterranean/base/${filename}`];
      return loader ? loader() : Promise.reject(new Error('Missing overview surface'));
    };
    loadSurfaceSector('overview',read).then(data=>{if(!cancelled)setOverviewBase(data);}).catch((error:unknown)=>console.error('[SmartCHARTS] Contexto de costa no disponible',error));
    return ()=>{cancelled=true;};
  },[enabled]);
  const [sectorId, setSectorId] = useState('overview');
  const [visible, setVisible] = useState({ sea: true, land: false, inlandWater: false, coastline: false, infrastructure: true });
  const [baseLoaded, setBaseLoaded] = useState<{ id: string; data: BaseSector | null; error: boolean }>({ id: '', data: null, error: false });
  const [loaded, setLoaded] = useState<{ id: string; data: CoastalCollection | null; error: boolean }>({ id: '', data: null, error: false });
  useEffect(() => {
    if(!enabled) return;
    if(viewport.zoom<8) { setSectorId('overview'); return; }
    const [w,s,e,n]=viewport.bbox, lon=(w+e)/2, lat=(s+n)/2;
    const candidates=sectors.filter(item=>!item.simplified && item.bbox[0]<=lon && item.bbox[2]>=lon && item.bbox[1]<=lat && item.bbox[3]>=lat);
    candidates.sort((a,b)=>(a.bbox[2]-a.bbox[0])*(a.bbox[3]-a.bbox[1])-(b.bbox[2]-b.bbox[0])*(b.bbox[3]-b.bbox[1]));
    setSectorId(candidates[0]?.id ?? 'overview');
  },[enabled,viewport]);
  const selected = sectors.find(s => s.id === sectorId) ?? sectors[0];
  const controlHost = controlsHost;
  useEffect(() => {
    if (!enabled || !selected) return;
    let cancelled = false;
    const id = selected.id;
    const load = async (): Promise<CoastalCollection> => {
      const parts = await Promise.all(selected.resources.map(async filename => {
        if (!new RegExp(`^sector-${id}-[0-9]+\\.json$`).test(filename)) throw new Error('Invalid coastal resource');
        const loader = loaders[`./mediterranean/${filename}`];
        if (!loader) throw new Error('Missing coastal resource');
        return loader();
      }));
      return { type: 'FeatureCollection', features: parts.flatMap(part => part.features) };
    };
    const readBase = (filename: string): Promise<unknown> => {
      const loader = baseLoaders[`./mediterranean/base/${filename}`];
      return loader ? loader() : Promise.reject(new Error('Missing local surface resource'));
    };
    setBaseLoaded({ id, data: null, error: false });
    {
      loadSurfaceSector(id, readBase).then(data => {
        if (!cancelled) setBaseLoaded({ id, data, error: false });
      }).catch((error: unknown) => { if (!cancelled) { setBaseLoaded({ id, data: null, error: true }); console.error('[SmartCHARTS] Base local no disponible', error); } });
    }
    setLoaded({ id, data: null, error: false });
    if (!load) { setLoaded({ id, data: null, error: true }); return; }
    load().then(data => { if (!cancelled) setLoaded({ id, data, error: false }); })
      .catch((error: unknown) => { if (!cancelled) { setLoaded({ id, data: null, error: true }); console.error('[SmartCHARTS] Sector local no disponible', error); } });
    return () => { cancelled = true; };
  }, [enabled, selected]);
  const visibleLines = useMemo(() => loaded.data ? { ...loaded.data, features: loaded.data.features.filter(f => f.properties.kind === 'coastline' ? visible.coastline : visible.infrastructure) } : null, [loaded.data, visible.coastline, visible.infrastructure]);
  if (!selected) return <div role="alert">SmartCHARTS: atlas costero no disponible</div>;
  // The source fixture is verified by SmartCHARTS motril.test.ts; JSON imports widen GeoJSON literals.
  const pilot = motrilPilot as unknown as FeatureCollection<LineString, { kind: string }>;
  return <>
    <TacticalChartQueries encFilename={encFilename} />
    {localNauticalEnabled && <Suspense fallback={null}><LocalNauticalLayer onStatus={setLocalNauticalStatus} /></Suspense>}
    {seamarksEnabled && !showOfflineSeamarks && <SeamarkLayer onLoading={seamarksStart} onReady={seamarksReady} onError={seamarksFailed} />}
    {showOfflineSeamarks && <Suspense fallback={null}><OfflineSeamarkLayer onStatus={setOfflineSeamarkStatus} /></Suspense>}
    {enabled && overviewBase && selected.id !== 'overview' && <Pane name="smartcharts-coastal-context" style={{zIndex:305,pointerEvents:'none'}}>
      {definitions.filter(d=>visible[d.id]).map(d=><GeoJSON key={d.id} data={overviewBase.layers[d.id]} interactive={false} pane="smartcharts-coastal-context" style={contextStyles[d.id]} />)}
    </Pane>}
    <Pane name="smartcharts-relief" style={{ zIndex: 340, pointerEvents: 'none' }}>
      {reliefEnabled && <Suspense fallback={null}><ReliefLayer settings={reliefSettings} opacity={reliefOpacity} onStatus={reportRelief} /></Suspense>}
    </Pane>
    <Pane name="smartcharts-bathymetry" style={{ zIndex: 350 }}>
    {bathymetryEnabled && loadedKey === activeKey && bathymetryCharts.map(bathymetry => <React.Fragment key={bathymetry.smartcharts.id}>
      <GeoJSON key={bathymetry.smartcharts.id} data={bathymetry} pane="smartcharts-bathymetry" style={bathymetryStyle} onEachFeature={(feature, layer) => {
        const label = document.createElement('span');
        label.textContent = `${String(feature.properties.depth_m)} m LAT · EMODnet 2024 · Experimental, no apta para navegacion`;
        layer.bindTooltip(label);
      }} />
    </React.Fragment>)}
    </Pane>
    <Pane name="smartcharts-depth-labels" style={{zIndex:360,pointerEvents:'none'}}>
      {bathymetryEnabled && depthLabelsEnabled && loadedKey===activeKey && <ContourDepthLabels charts={bathymetryCharts} />}
    </Pane>
    {motrilEnabled && <Pane name="smartcharts-motril" style={{ zIndex: 460 }}>
      <GeoJSON data={pilot} pane="smartcharts-motril" style={coastlineStyle} onEachFeature={(_, layer) => {
        const label = document.createElement('span');
        label.textContent = motrilPilot.smartcharts.warning;
        layer.bindTooltip(label);
      }} />
    </Pane>}
    {enabled && baseLoaded.id === selected.id && baseLoaded.data && definitions.map(definition => visible[definition.id] && <Pane key={definition.id} name={`smartcharts-${definition.id}`} style={{ zIndex: definition.order, pointerEvents: 'none' }}>
      <GeoJSON key={`${selected.id}:${definition.id}`} data={baseLoaded.data!.layers[definition.id]} pane={`smartcharts-${definition.id}`} interactive={false} onEachFeature={(_, layer) => { if (layer instanceof L.Polyline) layer.options.smoothFactor = 0; }} style={surfaceStyles[definition.id]} />
    </Pane>)}
    {enabled && loaded.id === selected.id && visibleLines && <GeoJSON key={`${selected.id}:${visible.coastline}:${visible.infrastructure}`} data={visibleLines} style={coastlineStyle} onEachFeature={(feature, layer) => {
      const label = document.createElement('span');
      label.textContent = `SmartCHARTS Mediterráneo · ${String(feature.properties.kind)} · Experimental, no apta para navegación`;
      layer.bindTooltip(label);
    }} />}
    {controlHost && createPortal(<div style={{ width: '100%', boxSizing: 'border-box', padding: 8, background: '#10202fee', color: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, font: '12px/1.4 system-ui' }}>
      <button type="button" aria-pressed={enabled} onClick={() => { setEnabled(v => !v); onPrincipalChange?.(!enabled); }} style={{ cursor: 'pointer', padding: 4 }}>
        {enabled ? 'Carta principal: piloto Mediterráneo · Cambiar a OSM' : 'Usar piloto Mediterráneo como carta principal'}
      </button>
      <button type="button" aria-pressed={motrilEnabled} onClick={() => {
        const next = !motrilEnabled;
        setMotrilEnabled(next);
        if (next) {
          map.fire('dragstart');
          const [w, s, e, n] = motrilPilot.bbox;
          map.fitBounds([[s, w], [n, e]], { paddingTopLeft: [24, 24], paddingBottomRight: [24, 190], maxZoom: 15 });
        }
      }} style={{ display: 'block', cursor: 'pointer', padding: 4, marginTop: 4 }}>
        {motrilEnabled ? 'Ocultar piloto Motril' : 'Ver piloto Motril'}
      </button>
      <button type="button" aria-pressed={bathymetryEnabled} onClick={() => {
        const next = !bathymetryEnabled;
        setLayerPreferences(previous => ({ ...previous, bathymetryEnabled: next }));
        if (next && selectedBathymetry) {
          map.fire('dragstart');
          const [w, s, e, n] = selectedBathymetry.bbox;
          map.fitBounds([[s, w], [n, e]], { paddingTopLeft: [24, 24], paddingBottomRight: [24, 240], maxZoom: selectedBathymetry.simplified ? 6 : 12 });
        }
      }} disabled={!selectedBathymetry} style={{ display: 'block', cursor: 'pointer', padding: 4, marginTop: 4 }}>
        {bathymetryEnabled ? 'Ocultar isobatas mediterraneas' : 'Ver isobatas · Mediterraneo completo'}
      </button>
      <button type="button" aria-pressed={reliefEnabled} style={{ display: 'block', padding: 4, marginTop: 4 }} onClick={() => {
        setLayerPreferences(previous => ({ ...previous, reliefEnabled: !previous.reliefEnabled }));
        if (!reliefEnabled) { map.fire('dragstart'); map.fitBounds([[30, -7.43], [46, 36.5]], { padding: [30, 30], maxZoom: 6 }); }
      }}>{reliefEnabled ? 'Ocultar relieve del Mediterráneo' : 'Ver relieve · Mediterráneo completo'}</button>
      {reliefEnabled && <fieldset style={{ border: '1px solid #64748b', marginTop: 6 }}>
        <legend>Relieve experimental · Mediterráneo</legend>
        <label style={{ display: 'block' }}>Paleta <select aria-label="Paleta del relieve" value={reliefSettings.palette} onChange={event => setReliefSettings(value => ({ ...value, palette: event.target.value === 'terrain' ? 'terrain' : 'ocean' }))}><option value="ocean">Azules oceánicos</option><option value="terrain">Verde y violeta</option></select></label>
        <label style={{ display: 'block' }}>Luz: {reliefSettings.azimuth}°<input aria-label="Dirección de la luz" type="range" min="0" max="360" step="15" value={reliefSettings.azimuth} onChange={event => setReliefSettings(value => ({ ...value, azimuth: Number(event.target.value) }))} /></label>
        <label style={{ display: 'block' }}>Altura de luz: {reliefSettings.altitude}°<input aria-label="Altura de la luz" type="range" min="15" max="75" step="15" value={reliefSettings.altitude} onChange={event => setReliefSettings(value => ({ ...value, altitude: Number(event.target.value) }))} /></label>
        <label style={{ display: 'block' }}>Sombreado: {Math.round(reliefSettings.strength * 100)}%<input aria-label="Intensidad del sombreado" type="range" min="0" max="1" step="0.1" value={reliefSettings.strength} onChange={event => setReliefSettings(value => ({ ...value, strength: Number(event.target.value) }))} /></label>
        <label style={{ display: 'block' }}>Opacidad: {Math.round(reliefOpacity * 100)}%<input aria-label="Opacidad del relieve" type="range" min="0.2" max="1" step="0.1" value={reliefOpacity} onChange={event => setReliefOpacity(Number(event.target.value))} /></label>
        <div role="status">{reliefStatus === 'error' ? 'Relieve no disponible' : reliefStatus === 'ready' ? 'Relieve cargado · isóbatas opcionales encima' : 'Preparando relieve local…'}</div>
        <div>Profundidad (m LAT): 0 · 50 · 200 · 500 · 1000 · 2000 · 5000</div>
        <div style={{ height: 10, background: reliefSettings.palette === 'ocean' ? 'linear-gradient(to right,#d2f2ee,#7dd1d4,#3aa1bb,#2573a0,#1d4d80,#183059,#0c1835)' : 'linear-gradient(to right,#dfefc6,#9dd9be,#4db6b8,#368cb0,#42689d,#4b4780,#27224c)' }} />
        <div>Rejilla visual ≈210–265 m · vista general ≈2,5 km · redondeada a 1 m.</div>
        <div>EMODnet DTM 2024 · CC BY 4.0 · LAT</div>
        <div>EXPERIMENTAL · NO APTA PARA NAVEGACIÓN · NO USAR PARA UKC</div>
      </fieldset>}
      {!preferencesSaved && <div role="status">No se pudo guardar la selección de relieve e isóbatas; se mantiene durante esta sesión.</div>}
      {!selectedBathymetry && <div role="alert">Catalogo batimetrico no disponible</div>}
      {bathymetryEnabled && selectedBathymetry && <div>
        <label>Sector de isobatas<br />
          <select aria-label="Sector batimetrico" value={automaticBathymetry ? 'automatic' : bathymetrySectorId} onChange={event => {
            if(event.target.value==='automatic'){setAutomaticBathymetry(true);return;}
            const sector = bathymetrySectors.find(item => item.id === event.target.value);
            if (!sector) return;
            setAutomaticBathymetry(false);
            setBathymetrySectorId(sector.id);
            map.fire('dragstart');
            const [w, s, e, n] = sector.bbox;
            map.fitBounds([[s, w], [n, e]], { paddingTopLeft: [24, 24], paddingBottomRight: [24, 240], maxZoom: sector.simplified ? 6 : 12 });
          }} style={{ background: '#10202f', color: '#fef3c7', maxWidth: '100%' }}>
            <option value="automatic">Automático · zona visible</option>
            {bathymetrySectors.map(sector => <option key={sector.id} value={sector.id}>{sector.label}</option>)}
          </select>
        </label>
        <label style={{display:'block'}}><input type="checkbox" checked={depthLabelsEnabled} onChange={event=>setDepthLabelsEnabled(event.target.checked)} />Numeración de isóbatas · m LAT</label>
        <label style={{display:'block'}}><input type="checkbox" checked={automaticBathymetry} onChange={event=>setAutomaticBathymetry(event.target.checked)} />Detalle automático al ampliar o desplazar</label>
        <div role="status">{bathymetryError ? 'Error al cargar isóbatas locales' : loadedKey!==activeKey ? 'Cargando detalle visible…' : `${bathymetryCharts.reduce((sum,c)=>sum+c.features.length,0)} curvas · ${activeBathymetry.some(s=>s.simplified) ? 'Vista general desde 100 m; amplía para detalle' : activeBathymetry.some(s=>s.id==='alboran-fine') ? 'Alborán: niveles intermedios desde 10 m LAT' : 'Detalle original desde 20 m LAT'}`}</div>
        Rejilla 3,75″ · No usar para calado o UKC<br />
        <div>La costa offline conserva su cobertura occidental.</div>
        EXPERIMENTAL · NO APTA PARA NAVEGACIÓN<br />
        <a href="https://doi.org/10.12770/cf51df64-56f9-4a99-b1aa-36b8d7b743a1" target="_blank" rel="noreferrer" style={{ color: '#bae6fd' }}>EMODnet Bathymetry Consortium / UE · DTM 2024</a><br />
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" style={{ color: '#bae6fd' }}>CC BY 4.0 · curvas derivadas</a>
      </div>}
      {motrilEnabled && <div role="status">
        Piloto Motril · {pilot.features.length} elementos · costa OSM<br />
        EXPERIMENTAL · NO APTA PARA NAVEGACIÓN · NO ES ENC OFICIAL<br />
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ color: '#bae6fd' }}>© OpenStreetMap contributors · ODbL-1.0</a>
      </div>}
        <fieldset style={{border:'1px solid #64748b',padding:6,marginTop:8}}>
          <legend>Simbología OpenSeaMap</legend>
          <div>La opción original muestra las imágenes publicadas por OpenSeaMap, con sus mismos iconos y detalle según escala. Se superpone a la carta y al relieve con fondo transparente.</div>
          {!nauticalPreferencesSaved && <div role="status">No se pudo guardar la selección de señales; se mantiene durante esta sesión.</div>}
          <label style={{display:'block'}}><input type="radio" name="smartcharts-symbol-source" checked={localNauticalEnabled} onChange={event => setNauticalPreferences({ version: 1, source: event.target.checked ? 'local' : 'none' })} />Objetos OSM · representación simplificada alternativa</label>
          {localNauticalEnabled && <div>Sin conexión · {localNauticalCatalog.total.toLocaleString('es-ES')} objetos · visibles desde zoom 10. Cobertura española del extracto; resto de cuenca pendiente. Pulsa un objeto para consultar atributos. Representación simplificada. <span role="status">{localNauticalStatus}</span></div>}
          <label style={{display:'block'}}><input type="radio" name="smartcharts-symbol-source" checked={seamarksEnabled} onChange={event => { setSeamarksError(false); setNauticalPreferences({ version: 1, source: event.target.checked ? 'openseamap' : 'none' }); }} />OpenSeaMap · iconos originales en línea</label>
          <label style={{display:'block'}}><input type="radio" name="smartcharts-symbol-source" checked={offlineSeamarksEnabled} onChange={event => setNauticalPreferences({ version: 1, source: event.target.checked ? 'offline' : 'none' })} />SeaChart · simbología sin conexión · cobertura limitada</label>
          <label style={{display:'block'}}><input type="radio" name="smartcharts-symbol-source" checked={nauticalPreferences.source === 'none'} onChange={() => setNauticalPreferences({ version: 1, source: 'none' })} />Ocultar simbología náutica</label>
          <div><a href="https://map.openseamap.org/legend.php?lang=en&page=seamark" target="_blank" rel="noreferrer" style={{color:'#bae6fd'}}>Leyenda original de OpenSeaMap</a> · boyas laterales y cardinales, marcas especiales y peligros. La leyenda permite consultar también puertos, luces y puentes.</div>
          {showOfflineSeamarks && <div>
            {seamarksEnabled && <div role="status">Las imágenes originales en línea no están disponibles. Respaldo SeaChart sin conexión: otra fecha y cobertura limitada; no equivale a la capa publicada actual. <button type="button" disabled={!networkOnline} onClick={() => setSeamarksError(false)}>Reintentar en línea</button></div>}
            <div role="status">{offlineSeamarkStatus === 'error' ? 'Error al leer señales offline; no se infiere ausencia de peligros.' : offlineSeamarkStatus === 'outside' ? 'Vista fuera del ámbito del paquete offline; sin señales locales disponibles.' : offlineSeamarkStatus === 'overview' ? 'Amplía para ver las señales offline.' : offlineSeamarkStatus === 'loading' ? 'Cargando señales locales…' : 'Simbología SeaChart sin conexión · fondo transparente'}</div>
            <div>{offlineSeamarkCatalog.inputObjects.toLocaleString('es-ES')} objetos OSM de origen · {offlineSeamarkCatalog.sourceTimestamp.slice(0, 10)} · visualización según escala. Ámbito España mediterránea, Baleares y Alborán–Melilla; incluye objetos norteafricanos dentro de la consulta. Inventario comunitario no exhaustivo; no sustituye una ENC oficial ni incluye radioavisos temporales verificados.</div>
            <a href={`${import.meta.env.BASE_URL}smartcharts/seamarks/NOTICE.txt`} target="_blank" rel="noreferrer">Procedencia y licencias del paquete</a>
            <div><a href={`${import.meta.env.BASE_URL}smartcharts/seamarks/inventory.json`} download>Descargar inventario con atributos y geometrías</a> · <a href={`${import.meta.env.BASE_URL}smartcharts/seamarks/renderer-source.zip`} download>Fuentes y procedimiento de generación</a></div>
            <div>Simbología SeaChart / OpenSeaMap · Malcolm Herring · GPL-2.0-or-later · datos OSM ODbL-1.0. El modo offline no solicita teselas públicas.</div>
          </div>}
          <div>Faros, boyas, balizas, luces, peligros y otras marcas publicadas por OpenSeaMap, según la escala. Amplía para ver el detalle. Datos comunitarios: no equivalen a un inventario completo ni a una ENC oficial.</div>
          {seamarksEnabled && !showOfflineSeamarks && <div role="status">{seamarksError ? 'No se pudieron cargar algunos símbolos. Comprueba la conexión; la ausencia de símbolos no indica ausencia de peligros.' : seamarksLoading ? 'Cargando símbolos de OpenSeaMap…' : 'Capa en línea · necesita conexión. No es un catálogo offline completo.'}</div>}
          <a href="https://www.openseamap.org/" target="_blank" rel="noreferrer" style={{color:'#bae6fd'}}>© OpenSeaMap / OpenStreetMap contributors</a>
        </fieldset>
      {enabled && <>
        <div style={{ margin: '6px 0' }}>
          <select aria-label="Sector costero" value={sectorId} onChange={e => setSectorId(e.target.value)} style={{ background: '#10202f', color: '#fef3c7', maxWidth: '100%' }}>
            {sectors.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button type="button" style={{ cursor: 'pointer', marginLeft: 8 }} onClick={() => {
            map.fire('dragstart');
            const [w, s, e, n] = selected.bbox;
            map.fitBounds([[s, w], [n, e]], { paddingTopLeft: [24, 24], paddingBottomRight: [24, 190], maxZoom: 14 });
          }}>Ver sector</button>
        </div>
        <div>{selected.simplified ? 'Vista general simplificada · elige sector para detalle' : 'Detalle original · sector geográfico'}</div>

        <details style={{ margin: '6px 0' }}>
          <summary style={{ cursor: 'pointer' }}>Capas</summary>
        <fieldset style={{ border: '1px solid #64748b', margin: '6px 0', padding: 4 }}>
          <legend>Capas</legend>
          {([...definitions.map(d => ({ id: d.id, label: d.label })), { id: 'coastline', label: 'Costa' }, { id: 'infrastructure', label: 'Diques y pantalanes' }] as { id: keyof typeof visible; label: string }[]).map(layer => <label key={layer.id} style={{ display: 'block' }}>
            <input type="checkbox" checked={visible[layer.id]} onChange={e => setVisible(previous => ({ ...previous, [layer.id]: e.target.checked }))} /> {layer.label}
          </label>)}
        </fieldset>
        </details>
        {baseLoaded.id !== selected.id || !baseLoaded.data ? <div role="status">{baseLoaded.id === selected.id && baseLoaded.error ? 'Base no disponible · no se infiere tierra o mar' : 'Cargando base local…'}</div> : null}
        <div>{bathymetryEnabled ? 'Base sin sondas · isobatas por sector' : 'Mar sin información de profundidad'}</div>
        {loaded.id !== selected.id || !loaded.data ? <div role="status">{loaded.id === selected.id && loaded.error ? 'Error al cargar el sector local' : 'Cargando sector local…'}</div> : null}
        <div role="status">EXPERIMENTAL · NO APTA PARA NAVEGACIÓN<br />NO ES ENC OFICIAL · {bathymetryEnabled ? 'ISÓBATAS REGIONALES EXPERIMENTALES' : 'SIN BATIMETRÍA'}</div>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ color: '#bae6fd' }}>© OpenStreetMap contributors / Geofabrik · ODbL</a>
      </>}
    </div>, controlHost)}
  </>;
}


// Instrument updates must not restyle all static chart geometry.
export default React.memo(SmartChartsPilotOverlay);
