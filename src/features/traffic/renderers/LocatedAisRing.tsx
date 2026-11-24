import React from 'react';
import { CircleMarker } from 'react-leaflet';
import { aisTargetPosition, type AisPanelTarget } from '../aisPanelModel';

/** Screen-sized locator, not a CPA/safety radius. Follows received target updates. */
export function LocatedAisRing({ target }: { target: AisPanelTarget | null }) {
  const position = target ? aisTargetPosition(target) : null;
  if (!position) return null;
  return <CircleMarker center={[position.lat, position.lng]} radius={24} interactive={false}
    pathOptions={{ className: 'ais-located-ring', color: '#c084fc', weight: 3, opacity: 1, fill: false }} />;
}
