import React, { useEffect, useMemo, useState } from 'react';
import { Marker, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import {
  POSITION_OBSOLETE_MS,
  POSITION_STALE_MS,
  formatAge,
  positionAgeMs,
  useVelarisLink
} from './velarisLinkStore';
import type { LinkPosition, LinkTrackPoint } from './velarisLinkTypes';

/**
 * Capa de carta independiente: posición GPS de los teléfonos vinculados y sus tracks.
 * Se dibuja con un color y un icono propios para no confundirla con la posición del barco
 * (instrumentos/NMEA), que sigue siendo responsabilidad de VelarisCore.
 */

const TRACK_COLOR = '#e879f9';
const GAP_COLOR = '#94a3b8';

function phoneIcon(state: 'live' | 'stale' | 'obsolete') {
  const color = state === 'live' ? '#e879f9' : state === 'stale' ? '#f59e0b' : '#64748b';
  return L.divIcon({
    className: 'velaris-link-phone',
    html: `<div style="width:22px;height:22px;border-radius:6px;background:${color};border:2px solid #fff;box-shadow:0 0 8px ${color};display:flex;align-items:center;justify-content:center;font-size:12px;">📱</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

/** Separa el track en tramos contiguos y tramos con puntos aún no recibidos (huecos de seq). */
function segments(points: LinkTrackPoint[]) {
  const solid: [number, number][][] = [];
  const gaps: [number, number][][] = [];
  let current: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];
    if (prev && p.seq !== prev.seq + 1) {
      if (current.length > 1) solid.push(current);
      gaps.push([[prev.lat, prev.lon], [p.lat, p.lon]]);
      current = [];
    }
    current.push([p.lat, p.lon]);
  }
  if (current.length > 1) solid.push(current);
  return { solid, gaps };
}

/** El origen siempre visible: un dato simulado nunca se presenta como GPS real. */
function sourceLabel(src: string): string {
  if (src === 'phone_gps') return 'GPS del teléfono';
  if (src === 'simulation') return 'SIMULADO (no es una posición real)';
  return `origen: ${src}`;
}

const PositionMarker: React.FC<{ position: LinkPosition; now: number }> = ({ position, now }) => {
  const age = positionAgeMs(position, now);
  const state = age > POSITION_OBSOLETE_MS ? 'obsolete' : age > POSITION_STALE_MS ? 'stale' : 'live';
  const icon = useMemo(() => phoneIcon(state), [state]);
  const { fix } = position;
  return (
    <Marker position={[fix.lat, fix.lon]} icon={icon} zIndexOffset={900}>
      <Tooltip direction="top" offset={[0, -12]} permanent={state !== 'obsolete'} opacity={0.95}>
        <div style={{ fontSize: 11, lineHeight: 1.35 }}>
          <strong>{position.deviceName}</strong> · {sourceLabel(fix.src)}
          <br />
          Recibida {formatAge(age)}
          {state === 'stale' && ' · sin datos recientes'}
          {state === 'obsolete' && ' · OBSOLETA'}
          <br />
          Hora GPS {new Date(fix.t).toLocaleTimeString('es-ES')}
          {fix.acc !== null && ` · ±${Math.round(fix.acc)} m`}
          {fix.sog !== null && ` · ${fix.sog.toFixed(1)} kn`}
          {fix.cog !== null && ` · ${Math.round(fix.cog)}°`}
        </div>
      </Tooltip>
    </Marker>
  );
};

export const VelarisLinkLayer: React.FC = () => {
  const link = useVelarisLink();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!link.available) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [link.available]);

  if (!link.available) return null;

  return (
    <>
      {link.visibleTrackIds.map((trackId) => {
        const points = link.points[trackId];
        if (!points || points.length === 0) return null;
        const { solid, gaps } = segments(points);
        return (
          <React.Fragment key={trackId}>
            {solid.map((line, i) => (
              <Polyline key={`s${i}`} positions={line} pathOptions={{ color: TRACK_COLOR, weight: 3, opacity: 0.9 }} />
            ))}
            {gaps.map((line, i) => (
              <Polyline key={`g${i}`} positions={line} pathOptions={{ color: GAP_COLOR, weight: 2, opacity: 0.8, dashArray: '4 6' }} />
            ))}
          </React.Fragment>
        );
      })}
      {Object.values(link.positions).map((position) => (
        <PositionMarker key={position.deviceId} position={position} now={now} />
      ))}
    </>
  );
};

export default VelarisLinkLayer;
