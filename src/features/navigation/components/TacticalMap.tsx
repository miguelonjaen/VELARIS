import type { WindObservation } from '../../../core/instruments/resolveWind';
import type { CopilotContext } from '../../copilot/context';
import type { PolarTargets } from '../../../core/navigation/BoatPolar';
import {getEncLayerName,getS57Number,getS57Codes,getEncPointIcon} from './smartcharts/enc-point-icons';
import React, { useState, useEffect, useMemo } from 'react';
import WindLayer from './WindLayer';
import SmartChartsPilotOverlay from './smartcharts/SmartChartsPilotOverlay';
import MarineLayer from './MarineLayer';
import type { MarineWeatherData } from '../../../lib/useMarineWeather';
import BoatLayer from "./SailHUD/layers/BoatLayer";
import FollowBoatControl from "./FollowBoatControl";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMapEvents,
  useMap,
  Popup,
  Tooltip,
  LayersControl,
  GeoJSON,
  ZoomControl
} from 'react-leaflet';
import L from 'leaflet';
import type { Feature, FeatureCollection, GeoJsonObject, Geometry } from 'geojson';
import 'leaflet/dist/leaflet.css';
import { Gauge, Navigation as NavIcon } from 'lucide-react';
// import { cn } from '@lib/utils';

import { calculateBearing } from '../../../navigation/calculateBearing';
import SailHUDLayer from "./SailHUD/SailHUDLayer";
import GaulosLinkLayer from "../../link/GaulosLinkLayer";
if (import.meta.env.DEV) {
  console.log('TACTICAL MAP ACTIVO');
}

type EncOverlayStatus = 'loading' | 'ready' | 'empty' | 'error' | 'zoom-in';
type EncPreviewFeature = Feature<Geometry, Record<string, unknown>>;
interface EncValidationSummary {
  checkedFeatures: number;
  checkedPositions: number;
  invalidCoordinates: number;
  invalidGeometries: number;
  soundingPoints: number;
  soundingsMissingDepth: number;
  invalidDepthAttributes: number;
  invalidCodedAttributes: number;
  missingDepthRanges: number;
  depthRangeOrderErrors: number;
  missingDepthContours: number;
  depthUnitCode: string | number | null;
  coordinateUnitCode: string | number | null;
  horizontalDatumCode: string | number | null;
  displayedSoundingPoints?: number;
}
interface EncPreviewCollection extends FeatureCollection<Geometry, Record<string, unknown>> {
  layersIncluded?: string[];
  validation?: EncValidationSummary;
}

interface EncVectorOverlayProps {
  filename: string;
  bounds: [number, number, number, number];
  onStatusChange: (status: EncOverlayStatus) => void;
  onValidationChange: (summary: EncValidationSummary | null) => void;
}

const ENC_VECTOR_PANE = 'encVectorPane';

const ENC_LAYER_COLORS: Record<string, string> = {
  DEPARE: '#38bdf8',
  DEPCNT: '#67e8f9',
  SOUNDG: '#e0f2fe',
  COALNE: '#8b6b3f',
  LNDARE: '#f4e58a',
  LAKARE: '#2563eb',
  OBSTRN: '#fb7185',
  UWTROC: '#f43f5e',
  WRECKS: '#f97316',
  LIGHTS: '#facc15',
  BOYLAT: '#fb923c',
  BOYSPP: '#fbbf24',
  BCNLAT: '#fb923c',
  BCNSPP: '#fbbf24',
  DAYMAR: '#fde047',
  PILPNT: '#fbbf24',
  FAIRWY: '#22d3ee',
  RESARE: '#a78bfa',
  M_COVR: '#94a3b8',
  M_QUAL: '#c084fc',
  BRIDGE: '#e2e8f0',
  SLCONS: '#cbd5e1',
  BUISGL: '#94a3b8'
};

interface EncLayerGroupDefinition {
  id: string;
  label: string;
  layerNames: readonly string[];
  checked: boolean;
}

const ENC_LAYER_GROUPS = [
  { id: 'soundings', label: 'Sondas', layerNames: ['SOUNDG'], checked: true },
  { id: 'bathymetry', label: 'Batimetría', layerNames: ['DEPARE', 'DEPCNT'], checked: true },
  { id: 'land-coast', label: 'Tierra y costa', layerNames: ['LNDARE', 'COALNE'], checked: true },
  {
    id: 'navigation-aids',
    label: 'Ayudas a la navegación',
    layerNames: ['LIGHTS', 'BOYLAT', 'BOYSPP', 'BCNLAT', 'BCNSPP', 'DAYMAR', 'PILPNT'],
    checked: true
  },
  { id: 'hazards', label: 'Peligros', layerNames: ['OBSTRN', 'UWTROC', 'WRECKS'], checked: true },
  {
    id: 'maritime-areas',
    label: 'Áreas marítimas',
    layerNames: ['LAKARE', 'FAIRWY', 'RESARE', 'M_COVR', 'M_QUAL'],
    checked: true
  },
  { id: 'infrastructure', label: 'Infraestructura', layerNames: ['BRIDGE', 'SLCONS', 'BUISGL'], checked: false }
] as const satisfies readonly EncLayerGroupDefinition[];

type EncLayerGroupId = typeof ENC_LAYER_GROUPS[number]['id'];
type EncLayerFeatureCollections = Record<EncLayerGroupId, EncPreviewCollection>;

const describeS57Attribute = (key: string, value: unknown): string => {
  const codes = getS57Codes(value);
  const labels = S57_ENUM_LABELS[key];
  if (labels && codes.length > 0) {
    return codes.map((code) => labels[code] ?? String(code)).join(', ');
  }
  if (key === 'VALSOU') {
    const sounding = getS57Number(value);
    if (sounding !== null) return `${sounding.toFixed(1)} m`;
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
};

const S57_ENUM_LABELS: Record<string, Record<number, string>> = {
  COLOUR: {
    1: 'blanco', 2: 'negro', 3: 'rojo', 4: 'verde', 5: 'azul', 6: 'amarillo', 7: 'gris',
    8: 'marrón', 9: 'ámbar', 10: 'violeta', 11: 'naranja', 12: 'magenta', 13: 'rosa'
  },
  BOYSHP: {
    1: 'cónica', 2: 'cilíndrica', 3: 'esférica', 4: 'pilar', 5: 'espar', 6: 'barril',
    7: 'superboya', 8: 'boya de hielo'
  },
  BCNSHP: {
    1: 'poste', 2: 'baliza de mimbre', 3: 'torre', 4: 'estructura reticulada',
    5: 'pilote', 6: 'montículo de piedras', 7: 'baliza flotante'
  },
  CATLAM: {
    1: 'marca lateral de babor', 2: 'marca lateral de estribor',
    3: 'canal preferente a estribor', 4: 'canal preferente a babor'
  },
  COLPAT: {
    1: 'franjas horizontales', 2: 'franjas verticales', 3: 'franjas diagonales',
    4: 'cuadriculado', 5: 'franjas de dirección desconocida', 6: 'franja de borde'
  }
};

const getSoundingScale = (zoom: number): { radius: number; opacity: number; weight: number } => {
  if (zoom < 12) return { radius: 1, opacity: 0.45, weight: 0.5 };
  if (zoom < 14) return { radius: 1.6, opacity: 0.7, weight: 0.7 };
  return { radius: 2.4, opacity: 0.95, weight: 0.9 };
};

const getSoundingSampleSpacing = (zoom: number): number => {
  if (zoom < 10) return 28;
  if (zoom < 12) return 20;
  if (zoom < 14) return 12;
  if (zoom < 16) return 8;
  return 32;
};

const getEncDisplayCollection = (
  source: EncPreviewCollection,
  map: L.Map,
  zoom: number
): EncPreviewCollection => {
  const spacing = getSoundingSampleSpacing(zoom);
  if (source.features.length === 0) return source;

  const cells = new Map<string, { featureIndex: number; coordinate: number[]; depth: number; centerDistance: number }>();
  source.features.forEach((feature, featureIndex) => {
    if (getEncLayerName(feature) !== 'SOUNDG') return;
    const geometry = feature.geometry;
    const coordinates = geometry.type === 'Point'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPoint' ? geometry.coordinates : [];

    for (const coordinate of coordinates) {
      if (coordinate.length < 2 || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) continue;
      const pixel = map.latLngToContainerPoint([coordinate[1], coordinate[0]]);
      const cellX = Math.floor(pixel.x / spacing);
      const cellY = Math.floor(pixel.y / spacing);
      const key = `${cellX}:${cellY}`;
      const depth = Number.isFinite(coordinate[2]) ? coordinate[2] : Number.POSITIVE_INFINITY;
      const centerX = (cellX + 0.5) * spacing;
      const centerY = (cellY + 0.5) * spacing;
      const centerDistance = (pixel.x - centerX) ** 2 + (pixel.y - centerY) ** 2;
      const current = cells.get(key);
      if (!current || depth < current.depth || (depth === current.depth && centerDistance < current.centerDistance)) {
        cells.set(key, { featureIndex, coordinate, depth, centerDistance });
      }
    }
  });

  const sampledCoordinates = new Map<number, number[][]>();
  for (const candidate of cells.values()) {
    const points = sampledCoordinates.get(candidate.featureIndex) ?? [];
    points.push(candidate.coordinate);
    sampledCoordinates.set(candidate.featureIndex, points);
  }

  const visibleFeatures: EncPreviewFeature[] = [];
  source.features.forEach((feature, featureIndex) => {
    if (getEncLayerName(feature) !== 'SOUNDG') {
      visibleFeatures.push(feature);
      return;
    }
    const geometry = feature.geometry;
    const points = sampledCoordinates.get(featureIndex);
    if (!points || points.length === 0) return;
    if (geometry.type === 'Point') {
      visibleFeatures.push({ ...feature, geometry: { ...geometry, coordinates: points[0] } });
    } else if (geometry.type === 'MultiPoint') {
      visibleFeatures.push({ ...feature, geometry: { ...geometry, coordinates: points } });
    } else {
      visibleFeatures.push(feature);
    }
  });

  return {
    ...source,
    features: visibleFeatures,
    ...(source.validation ? { validation: { ...source.validation, displayedSoundingPoints: cells.size } } : {})
  };
};

const EncVectorOverlay: React.FC<EncVectorOverlayProps> = ({ filename, bounds, onStatusChange, onValidationChange }) => {
  const map = useMap();
  if (!map.getPane(ENC_VECTOR_PANE)) {
    const pane = map.createPane(ENC_VECTOR_PANE);
    pane.style.zIndex = '450';
  }
  const [viewBounds, setViewBounds] = useState('');
  const [zoom, setZoom] = useState(map.getZoom());
  const [collection, setCollection] = useState<EncPreviewCollection | null>(null);
  const displayCollection = useMemo(
    () => collection ? getEncDisplayCollection(collection, map, zoom) : null,
    [collection, map, zoom]
  );
  const groupedCollections = useMemo<EncLayerFeatureCollections>(() => {
    const grouped = Object.fromEntries(ENC_LAYER_GROUPS.map(({ id }) => [
      id,
      { type: 'FeatureCollection' as const, features: [] as EncPreviewFeature[] }
    ])) as unknown as EncLayerFeatureCollections;

    if (!displayCollection) return grouped;

    for (const feature of displayCollection.features) {
      const layerName = getEncLayerName(feature);
      const group = ENC_LAYER_GROUPS.find(({ layerNames }) => layerNames.some(name => name === layerName));
      if (group) grouped[group.id].features.push(feature);
    }
    return grouped;
  }, [displayCollection]);

  useEffect(() => {
    const updateZoom = () => setZoom(map.getZoom());
    map.on('zoomend', updateZoom);
    return () => { map.off('zoomend', updateZoom); };
  }, [map]);

  useEffect(() => {
    map.fitBounds(
      [[bounds[1], bounds[0]], [bounds[3], bounds[2]]],
      { padding: [24, 24], maxZoom: 12 }
    );
  }, [map, filename, bounds]);

  useEffect(() => {
    const updateViewBounds = () => {
      const mapBounds = map.getBounds();
      const west = mapBounds.getWest();
      const south = mapBounds.getSouth();
      const east = mapBounds.getEast();
      const north = mapBounds.getNorth();
      if (east - west > 2 || north - south > 2) {
        setViewBounds('');
        return;
      }
      setViewBounds([west, south, east, north].map(value => value.toFixed(5)).join(','));
    };

    map.on('moveend', updateViewBounds);
    updateViewBounds();
    return () => { map.off('moveend', updateViewBounds); };
  }, [map]);

  useEffect(() => {
    if (!viewBounds) {
      setCollection(null);
      onValidationChange(null);
      onStatusChange('zoom-in');
      return;
    }

    const controller = new AbortController();
    onValidationChange(null);
    onStatusChange('loading');
    const query = new URLSearchParams({ bbox: viewBounds });
    fetch(`http://127.0.0.1:8089/api/enc-charts/${encodeURIComponent(filename)}/preview?${query}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = await response.json() as EncPreviewCollection | { error?: string };
        if (!response.ok) {
          throw new Error('error' in payload && payload.error ? payload.error : 'No se pudo cargar la vista ENC.');
        }
        const preview = payload as EncPreviewCollection;
        setCollection(preview);
        onValidationChange(preview.validation ?? null);
        onStatusChange(preview.features.length > 0 ? 'ready' : 'empty');
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setCollection(null);
        onValidationChange(null);
        onStatusChange('error');
        console.error('[ENC] Error cargando superposición vectorial:', error);
      });

    return () => controller.abort();
  }, [filename, viewBounds, onStatusChange, onValidationChange]);

  if (!displayCollection) return null;
  return (
    <LayersControl position="topright">
      {ENC_LAYER_GROUPS.map((group) => (
        <LayersControl.Overlay key={group.id} checked={group.checked} name={group.label}>
          <GeoJSON
            key={`${filename}:${viewBounds}:${group.id}:${zoom < 12 ? 0 : zoom < 14 ? 1 : zoom < 15 ? 2 : 3}`}
            data={groupedCollections[group.id] as GeoJsonObject}
            pane={ENC_VECTOR_PANE}
            style={(feature) => {
              const layerName = getEncLayerName(feature as EncPreviewFeature | undefined);
              const isCoverageBoundary = layerName === 'M_COVR' || layerName === 'M_QUAL';
              const isHazard = ['OBSTRN', 'UWTROC', 'WRECKS'].includes(layerName);
              const color = isHazard ? '#ef4444' : ENC_LAYER_COLORS[layerName] ?? '#cbd5e1';
              const isArea = ['DEPARE', 'LNDARE', 'LAKARE', 'RESARE', 'BRIDGE', 'SLCONS', 'BUISGL'].includes(layerName);
              const isLand = layerName === 'LNDARE';
              const isCoastline = layerName === 'COALNE';
              return {
                color,
                weight: isCoverageBoundary ? 0.55 : isHazard ? 1.7 : isCoastline ? 1.2 : layerName === 'DEPCNT' ? 1 : layerName === 'DEPARE' ? 0.8 : 1.3,
                opacity: isCoverageBoundary ? 0.3 : 0.9,
                fillColor: color,
                fillOpacity: isCoverageBoundary ? 0 : isLand ? 0.92 : isHazard ? 0.18 : layerName === 'DEPARE' ? 0.12 : isArea ? 0.08 : 0,
                dashArray: isCoverageBoundary ? '4 3' : undefined
              };
            }}
            pointToLayer={(feature, latlng) => {
              const layerName = getEncLayerName(feature as EncPreviewFeature | undefined);
              if (layerName === 'SOUNDG') {
                if (zoom >= 16 && typeof latlng.alt === 'number' && Number.isFinite(latlng.alt)) {
                  const depthLabel = L.divIcon({
                    className: 'enc-sounding-label',
                    html: `<span style="display:block;padding:1px 3px;border:1px solid #075985;border-radius:3px;background:#082f49e8;color:#e0f2fe;font:600 10px/14px system-ui,sans-serif;white-space:nowrap;text-align:center">${latlng.alt.toFixed(1)}</span>`,
                    iconSize: [38, 16],
                    iconAnchor: [19, 8]
                  });
                  const marker = L.marker(latlng, { icon: depthLabel, keyboard: true, pane: ENC_VECTOR_PANE });
                  marker.bindPopup(`Sonda ENC: <strong>${latlng.alt.toFixed(1)} m</strong>`);
                  return marker;
                }

                const soundingScale = getSoundingScale(zoom);
                const marker = L.circleMarker(latlng, {
                  radius: soundingScale.radius,
                  color: '#bae6fd',
                  fillColor: '#38bdf8',
                  fillOpacity: soundingScale.opacity,
                  weight: soundingScale.weight,
                  pane: ENC_VECTOR_PANE
                });
                if (typeof latlng.alt === 'number' && Number.isFinite(latlng.alt)) {
                  marker.bindPopup(`Sonda ENC: <strong>${latlng.alt.toFixed(1)} m</strong>`);
                }
                return marker;
              }

              const pointFeature = feature as EncPreviewFeature;
              const pointIcon = getEncPointIcon(pointFeature, zoom);
              return L.marker(latlng, { icon: pointIcon, pane: ENC_VECTOR_PANE });
            }}
            onEachFeature={(feature, layer) => {
              const encFeature = feature as EncPreviewFeature;
              const layerName = getEncLayerName(encFeature);
              if (layerName === 'SOUNDG') return;

              const container = document.createElement('div');
              const title = document.createElement('strong');
              title.textContent = layerName;
              container.appendChild(title);

              const attributePriority = [
                'OBJNAM', 'CATLAM', 'BOYSHP', 'BCNSHP', 'COLOUR', 'COLPAT', 'CATOBS', 'CATWRK',
                'VALSOU', 'QUASOU', 'WATLEV', 'EXPSOU', 'CATLIT', 'LITCHR', 'SIGPER', 'HEIGHT'
              ];
              const attributes = Object.entries(encFeature.properties ?? {})
                .filter(([key, value]) => key !== '__s57Layer' && value !== null && value !== undefined)
                .sort(([left], [right]) => {
                  const leftPriority = attributePriority.indexOf(left);
                  const rightPriority = attributePriority.indexOf(right);
                  return (leftPriority < 0 ? Number.MAX_SAFE_INTEGER : leftPriority)
                    - (rightPriority < 0 ? Number.MAX_SAFE_INTEGER : rightPriority);
                })
                .slice(0, 10);
              for (const [key, value] of attributes) {
                const row = document.createElement('div');
                row.textContent = `${key}: ${describeS57Attribute(key, value)}`;
                container.appendChild(row);
              }
              layer.bindPopup(container);
            }}
          />
        </LayersControl.Overlay>
      ))}
    </LayersControl>
  );
};

function WeatherChartObserver() {
  const map = useMap();

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const publish = () => {
      if (timer !== undefined) clearTimeout(timer);

      timer = setTimeout(() => {
        const center = map.getCenter().wrap();

        if (
          !Number.isFinite(center.lat) ||
          !Number.isFinite(center.lng)
        ) return;

        window.dispatchEvent(
          new CustomEvent('gaulos:weather-chart-center', {
            detail: {
              lat: Math.round(center.lat * 100) / 100,
              lng: Math.round(center.lng * 100) / 100
            }
          })
        );
      }, 900);
    };

    map.whenReady(publish);
    map.on('moveend', publish);

    return () => {
      if (timer !== undefined) clearTimeout(timer);

      map.off('moveend', publish);
      map.off('load', publish);
    };
  }, [map]);

  return null;
}

interface TacticalMapProps {
  getCopilotContext?: () => CopilotContext;
  center: [number, number] | null;
  zoom: number;
  shipPosition: { lat: number; lng: number } | null;
  shipName: string;
  navPlan: any;
  targetDestination: { lat: number; lng: number } | null;
  currentPath: [number, number][];
  trackSegments?: [number, number][][];
  onMapClick: (lat: number, lng: number) => void;
  onMapRightClick: (e: any) => void;
  onDragStart: () => void;
  isLaylinesActive: boolean;
  isWaypointLaylinesActive?: boolean;
  aisFocusRequest?: number;
  portLaylinePath?: [number, number][];
  boatPortLaylinePath?: [number, number][];
  boatStbdLaylinePath?: [number, number][];
  stbdLaylinePath?: [number, number][];
  collisionFilter?: boolean;
  children?: React.ReactNode;
  compact?: boolean;
  pilotControlsHost?: HTMLElement | null;
  windFlowControlsHost?: HTMLElement | null;
  instrumentWind?: WindObservation;
  marineControlsHost?: HTMLElement | null;
  onPilotPrincipalChange?: (enabled: boolean) => void;
  listaCartas: any[];
  cartasActivas: Record<string, boolean>;
  isSailSteerWidgetOpen?: boolean;
  twd?: number;
  polarTargets?: PolarTargets | null;
  relativeWindAngle?: number;
  windReference?: 'TWA' | 'AWA';
  waypointBearing?: number;
  heading?: number;
  /** true si la posición del barco procede del simulador NMEA: el marcador se rotula «SIM». */
  positionSimulated?: boolean;
  /** Posición válida y actual del barco para «Seguir barco» (null si no la hay: no se centra). */
  followPosition?: { lat: number; lng: number } | null;
  showWind?: boolean;
  windSpeed?: number;
  windDirection?: number;
  marineWeather?: MarineWeatherData | null;
  showWaves?: boolean;
  showCurrent?: boolean;
  encOverlay?: { filename: string; bounds: [number, number, number, number] } | null;
  onEncOverlayStatusChange?: (status: EncOverlayStatus) => void;
  encOverlayStatus?: EncOverlayStatus;

}


const MapUpdater = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  const [lat, lng] = center;
  useEffect(() => {
    if (!map.getCenter().equals([lat, lng])) map.setView([lat, lng]);
  }, [lat, lng, map]);
  return null;
};

const ZoomWatcher = ({
  onZoomChange
}: {
  onZoomChange: (zoom: number) => void;
}) => {

  useMapEvents({
    zoomend(e) {
      onZoomChange(e.target.getZoom());
    }
  });

  return null;
};



const InternalEvents = ({ onMapClick, onMapRightClick, onDragStart }: any) => {
  useMapEvents({
    click: (e) => onMapClick(e.latlng.lat, e.latlng.lng),
    contextmenu: onMapRightClick,
    dragstart: onDragStart
  });
  return null;
};

export const TacticalMap: React.FC<TacticalMapProps> = ({
    center,
    zoom,
    shipPosition,
    shipName,
    navPlan,
    targetDestination,
    currentPath,
    trackSegments,
    onMapClick,
    onMapRightClick,
    onDragStart,
    isLaylinesActive,
    isWaypointLaylinesActive = false,
    aisFocusRequest = 0,
    portLaylinePath,
    boatPortLaylinePath,
    boatStbdLaylinePath,
    isSailSteerWidgetOpen,
    stbdLaylinePath,
    collisionFilter,
    listaCartas,
    cartasActivas,
    twd,
    polarTargets,
    relativeWindAngle,
    windReference,
    waypointBearing,
    heading,
    positionSimulated = false,
    followPosition = null,
    children,
    showWind,
windSpeed,
windDirection,
    marineWeather,
    showWaves = false,
    showCurrent = false,
    encOverlay = null,
    onEncOverlayStatusChange = () => undefined,
    encOverlayStatus = 'ready',
    onPilotPrincipalChange,
    pilotControlsHost = null,
    windFlowControlsHost = null,
    instrumentWind,
    marineControlsHost = null,
    getCopilotContext,
    compact = false
}) => {
  const [mapZoom, setMapZoom] = useState(zoom);
  const [encValidation, setEncValidation] = useState<EncValidationSummary | null>(null);
  const validationWarning = Boolean(encValidation && (
    encValidation.invalidCoordinates > 0
    || encValidation.invalidGeometries > 0
    || encValidation.soundingsMissingDepth > 0
    || encValidation.invalidDepthAttributes > 0
    || encValidation.invalidCodedAttributes > 0
    || encValidation.missingDepthRanges > 0
    || encValidation.depthRangeOrderErrors > 0
    || encValidation.missingDepthContours > 0
    || encValidation.depthUnitCode === null
    || encValidation.coordinateUnitCode === null
    || encValidation.horizontalDatumCode === null
    || String(encValidation.depthUnitCode) !== '1'
    || String(encValidation.coordinateUnitCode) !== '1'
    || String(encValidation.horizontalDatumCode) !== '2'
  ));
  if (center === null) {
    return <div className="h-full w-full bg-slate-950" />;
  }
  // console.log("HUD Heading:", heading);
  const shipHeading = heading ?? 0;
const shipSize = Math.max(
  12,
  Math.min(
    60,
    mapZoom * 4
  )
);

  return (
    <div
  className="vl-chart relative"
  style={{
    width: '100%',
    height: '100%',
    minHeight: compact ? '100%' : '600px'
  }}
>
      <MapContainer
    center={center}
    zoom={zoom}
    minZoom={compact ? zoom : 4}
    maxZoom={compact ? zoom : 16}
    className="h-full w-full"
    // El zoom se añade explícitamente arriba a la derecha (<ZoomControl>); el control
    // por defecto de arriba a la izquierda quedaba duplicado bajo el panel meteo.
    zoomControl={false}
    dragging={!compact}
    scrollWheelZoom={!compact}
    doubleClickZoom={!compact}
    touchZoom={!compact}
    boxZoom={!compact}
    keyboard={!compact}
    attributionControl={!compact}
>
        {!compact && (
    <ZoomControl position="topright" />
)}
        {!compact && <FollowBoatControl position={followPosition} focusRequest={aisFocusRequest} />}
        <MapUpdater center={center} />
        <ZoomWatcher
  onZoomChange={setMapZoom}
/>


        {!compact && (
    <>
      <WeatherChartObserver />
      <InternalEvents
        onMapClick={onMapClick}
        onMapRightClick={onMapRightClick}
        onDragStart={onDragStart}
      />
    </>
)}
        <TileLayer
  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  attribution="© OpenStreetMap contributors"
/>

{listaCartas?.map(chart =>
  cartasActivas?.[chart.name] ? (
    <TileLayer
      key={chart.name}
      url={`http://127.0.0.1:8089/tiles/${chart.name}/{z}/{x}/{y}.png`}
      opacity={1}
    />
  ) : null
)}

{!compact && <SmartChartsPilotOverlay encFilename={encOverlay?.filename} controlsHost={pilotControlsHost} onPrincipalChange={onPilotPrincipalChange} />}

{encOverlay && (
  <EncVectorOverlay
    filename={encOverlay.filename}
    bounds={encOverlay.bounds}
    onStatusChange={onEncOverlayStatusChange}
    onValidationChange={setEncValidation}
  />
)}



<WindLayer visible={showWind === true} controlsHost={windFlowControlsHost} instrumentWind={instrumentWind} />

<MarineLayer
  shipPosition={shipPosition}
  marineWeather={marineWeather ?? null}
  controlsHost={marineControlsHost}
  showWaves={showWaves}
  showCurrent={showCurrent}
/>

<BoatLayer
  shipPosition={shipPosition}
  heading={shipHeading}
  simulated={positionSimulated}
/>


{isSailSteerWidgetOpen && (
  <SailHUDLayer
  shipPosition={shipPosition}
  heading={shipHeading}
  twd={twd}
  polarTargets={polarTargets}
  relativeWindAngle={relativeWindAngle}
  windReference={windReference}
  waypointBearing={waypointBearing}
/>
)}



{(trackSegments ?? [currentPath]).some(segment => segment.length > 1) && (
  <Polyline
    positions={trackSegments ?? currentPath}
    color="#00ffff"
    weight={3}
    opacity={0.8}
  />
)}
        {/*
        {navPlan.targetCoords && shipPosition && (
          <>
            <Polyline positions={[[shipPosition.lat, shipPosition.lng], [navPlan.targetCoords.lat, navPlan.targetCoords.lng]]} color="#00FFFF" weight={2} dashArray="5, 10" opacity={0.8} />
            <Marker position={[navPlan.targetCoords.lat, navPlan.targetCoords.lng]} icon={L.divIcon({ className: 'target-flag-icon', html: '<div class="w-10 h-10 flex flex-col items-center justify-center filter drop-shadow-[0_0_8px_cyan]"><svg viewBox="0 0 24 24" fill="none" stroke="cyan" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 fill-cyan/20"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg></div>', iconSize: [40, 40], iconAnchor: [20, 35] })} />
          </>
        )}
          */}
{navPlan.targetCoords && (
  <Marker
    position={[
      navPlan.targetCoords.lat,
      navPlan.targetCoords.lng
    ]}
    icon={L.divIcon({
      className: 'target-flag-icon',
      html: '...',
      iconSize: [40, 40],
      iconAnchor: [20, 35]
    })}
  />
)}
        {/* Rumbos polares desde el barco y referencias de llegada al waypoint. */}
        {isLaylinesActive && boatPortLaylinePath && <Polyline positions={boatPortLaylinePath} color="#ef4444" weight={1.5} opacity={0.8}><Tooltip>Rumbo polar · babor</Tooltip></Polyline>}
        {isLaylinesActive && boatStbdLaylinePath && <Polyline positions={boatStbdLaylinePath} color="#22c55e" weight={1.5} opacity={0.8}><Tooltip>Rumbo polar · estribor</Tooltip></Polyline>}
        {isWaypointLaylinesActive && polarTargets && portLaylinePath && portLaylinePath.length >= 2 && (
          <Polyline
            positions={portLaylinePath}
            color="#ef4444" // Red for Port
            weight={2}
            dashArray="6, 6"
            opacity={0.55}
          />
        )}
        {isWaypointLaylinesActive && polarTargets && stbdLaylinePath && stbdLaylinePath.length >= 2 && (
          <Polyline
            positions={stbdLaylinePath}
            color="#22c55e" // Green for Starboard
            weight={2}
            dashArray="6, 6"
            opacity={0.55}
          />
        )}



        {/*
        {shipPosition && targetDestination && (
  <Polyline
    positions={[
      [shipPosition.lat, shipPosition.lng],
      [targetDestination.lat, targetDestination.lng]
    ]}
    color="#ff00ff"
    weight={3}
    dashArray="6,4"
  />
)}
  */}
        {targetDestination && (
          <Marker position={[targetDestination.lat, targetDestination.lng]} icon={L.divIcon({ className: 'target-dest-icon', html: '<div class="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center border-2 border-white shadow-lg animate-bounce">📍</div>', iconSize: [32, 32], iconAnchor: [16, 32] })}>
            <Popup className="custom-popup">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 w-56 shadow-2xl text-white">
                <p className="text-xs font-black text-cyan-400 uppercase tracking-widest mb-3 flex items-center gap-2"><NavIcon className="w-3.5 h-3.5" /> Punto Táctico</p>
                <p className="text-[10px] text-slate-500 font-mono">LAT: {targetDestination.lat.toFixed(4)}</p>
                <p className="text-[10px] text-slate-500 font-mono">LNG: {targetDestination.lng.toFixed(4)}</p>
              </div>
            </Popup>
          </Marker>
        )}
{/* AIS Táctico temporalmente deshabilitado */}

{/* Teléfonos vinculados por GAULOS Link: capa propia, separada de la posición del barco */}
<GaulosLinkLayer />
{children}
</MapContainer>
      {encOverlay && (
        <div
          className="pointer-events-none absolute z-(--vl-z-chart-widget) rounded-xl border border-amber-400/50 bg-slate-950/95 px-3 py-2 text-amber-100 shadow-xl"
          style={{
            /* A la derecha del panel meteorológico y bajo la banda Command Center. */
            top: 'var(--vl-content-top)',
            left: 'calc(var(--vl-weather-w) + var(--vl-gap) * 2)',
            maxWidth: 'min(420px, calc(100% - var(--vl-weather-w) - var(--vl-dock-reserve) - var(--vl-gap) * 3))',
          }}
        >
          <p className="text-[10px] font-black uppercase tracking-wide">ENC S-57 · vista de referencia · no usar para navegar</p>
          <p className="mt-1 text-[9px] text-slate-300">
            {encOverlay.filename} · {{
              loading: 'cargando viewport…',
              ready: 'objetos visibles',
              empty: 'sin objetos ENC en esta zona',
              error: 'no se pudo cargar la capa',
              'zoom-in': 'acerca el zoom a menos de 2°'
            }[encOverlayStatus]}
          </p>
          {encValidation && (
            <p className={`mt-1 text-[9px] ${validationWarning ? 'text-amber-300' : 'text-emerald-300'}`}>
              {validationWarning ? 'Revisar ENC' : 'Validación viewport OK'} · {encValidation.invalidCoordinates} coord. · {encValidation.invalidGeometries} geom. · {encValidation.soundingsMissingDepth} sondas sin Z · {encValidation.invalidDepthAttributes} attrs. prof. inválidos · attrs. codificados inválidos {encValidation.invalidCodedAttributes} · rango ausente {encValidation.missingDepthRanges} · rango invertido {encValidation.depthRangeOrderErrors} · contorno {encValidation.missingDepthContours} · sondas {encValidation.displayedSoundingPoints ?? encValidation.soundingPoints}/{encValidation.soundingPoints} · DUNI {encValidation.depthUnitCode ?? 'ND'} · COUN {encValidation.coordinateUnitCode ?? 'ND'} · HDAT {encValidation.horizontalDatumCode ?? 'ND'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default TacticalMap;
