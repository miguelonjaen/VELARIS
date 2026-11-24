import React from 'react';
import { Marker, Popup, CircleMarker, Polyline, useMap } from 'react-leaflet';
import type { ShipData } from '@/shared/types';
import { createShipIcon } from '../../../components/vessels/createShipIcon';
import { ZoomStyleResolver } from '@/rendering/ZoomStyleResolver';
import { calculateDistanceNM } from '@/lib/aisMath';
import { aisDisplayMotion, finite, formatCpa, formatTcpa, targetStatus, type AisPanelTarget } from '../aisPanelModel';

interface Props {
  simulatedAisTargets: AisPanelTarget[]; // Historical prop name; these are received, enriched targets.
  shipPosition: { lat: number; lng: number } | null;
  selectedShipId: string | null;
  fleet: ShipData[];
}
const zoomStyle = new ZoomStyleResolver();
const riskColors: Record<string, string> = { CRITICAL: '#ef4444', WARNING: '#f97316', CAUTION: '#facc15', SAFE: '#22c55e' };
export const FleetMarkers: React.FC<Props> = ({ simulatedAisTargets, shipPosition }) => {
  const zoom = useMap().getZoom();
  return <>{simulatedAisTargets.map(t => {
    const lng = t.lng ?? t.lon;
    if (!finite(t.lat) || Math.abs(t.lat) > 90 || !finite(lng) || Math.abs(lng) > 180) return null;
    const { course, speed, vectorAvailable } = aisDisplayMotion(t);
    const valid = t.dataStatus === 'VALID';
    const risk = valid ? t.riskLevel ?? 'SAFE' : 'UNKNOWN';
    const color = valid ? riskColors[risk] ?? '#94a3b8' : '#94a3b8';
    const distance = shipPosition ? calculateDistanceNM(shipPosition.lat, shipPosition.lng, t.lat, lng) : null;
    const popup = <Popup><div><b>{t.nombre || t.name || t.mmsi}</b><br />MMSI: {t.mmsi}
      <br />DIST: {finite(distance) ? `${distance.toFixed(2)} nm` : '—'}
      <br />{finite(t.tcpaMinutes) && t.tcpaMinutes < 0 ? 'DIST actual' : 'CPA'}: {formatCpa(t)}<br />TCPA: {formatTcpa(t)}
      <br />RISK: {valid ? risk : 'SIN DATOS'}<br />{targetStatus(t)}
      <br />SOG: {speed === null ? '—' : `${speed.toFixed(1)} kn`}
      <br />COG: {course === null ? '—' : `${course.toFixed(0)}°`}</div></Popup>;
    let future: [number, number] | null = null;
    if (vectorAvailable && course !== null && speed !== null && Math.abs(t.lat) < 85) {
      const rad = course * Math.PI / 180;
      const lat = t.lat + speed * 0.5 * Math.cos(rad) / 60;
      const lon = lng + speed * 0.5 * Math.sin(rad) / (60 * Math.cos(t.lat * Math.PI / 180));
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) future = [lat, lon];
    }
    return <React.Fragment key={String(t.mmsi ?? t.id)}>
      {future && <Polyline positions={[[t.lat, lng], future]} color={color} weight={2} opacity={0.7} />}
      {course !== null ? <Marker position={[t.lat, lng]}
        icon={createShipIcon({ heading: course, color, size: zoomStyle.getShipSize(zoom) })}>{popup}</Marker>
        : <CircleMarker center={[t.lat, lng]} radius={5} pathOptions={{ color, fillOpacity: 0.6 }}>{popup}</CircleMarker>}
    </React.Fragment>;
  })}</>;
};
