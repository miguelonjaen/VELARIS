import { createInstrumentGeometry } from './InstrumentGeometry';
import { createCompassRoseSVG } from './createCompassRoseSVG';
import { createWindNeedleSVG } from './createWindNeedleSVG';
import { createWaypointBeamSVG } from './createWaypointBeamSVG';
import { sailHudBearings } from './sailHudBearings';

export interface SailHudDisplay {
  heading?: number;
  twd?: number;
  relativeWindAngle?: number;
  windReference?: 'TWA' | 'AWA';
  waypointBearing?: number;
}
export const SAIL_HUD_SIZE = 260;

/** North-up, transparent overlay. BoatLayer owns the single vessel symbol.
 * Tactical laylines belong to the chart and require validated polar/NMEA data.
 */
export function buildSailHudHtml(input: SailHudDisplay): string {
  const g = createInstrumentGeometry(SAIL_HUD_SIZE);
  const heading = typeof input.heading === 'number' && Number.isFinite(input.heading) ? input.heading : null;
  const bearings = sailHudBearings(heading ?? Number.NaN, input.twd, input.relativeWindAngle, input.waypointBearing);
  const wind = bearings.wind === null ? '' : createWindNeedleSVG(g, 0, bearings.wind);
  const waypoint = bearings.waypoint === null ? '' : createWaypointBeamSVG(g, 0, bearings.waypoint);
  const ray = heading === null ? '' : `<svg width="${g.size}" height="${g.size}" style="position:absolute;inset:0;overflow:visible"><title>Dirección del barco</title><g transform="rotate(${heading} ${g.center} ${g.center})"><path d="M${g.center} ${g.center - 23} V${g.center - g.compassOuterRadius + 8}" fill="none" stroke="#67e8f9" stroke-width="2" stroke-opacity=".8"/></g></svg>`;
  const windLabel = Number.isFinite(input.twd) ? 'Viento real' : input.windReference === 'AWA' ? 'Viento aparente' : 'Viento relativo';
  return `<div data-sail-hud="simple" style="position:relative;width:${g.size}px;height:${g.size}px;pointer-events:none">
    ${createCompassRoseSVG(g, 0)}${ray}${wind}${waypoint}
    <div style="position:absolute;top:${g.size + 10}px;left:-15px;width:${g.size + 30}px;display:flex;justify-content:center;gap:12px;font:11px Segoe UI,sans-serif;color:#d9e8ef;text-shadow:0 1px 3px #020617,0 0 3px #020617">
    ${heading === null ? '' : '<span style="color:#67e8f9">━ Rumbo</span>'}
    ${wind ? `<span>↙ ${windLabel}</span>` : ''}${waypoint ? '<span style="color:#c4b5fd">↗ WP</span>' : ''}
    </div></div>`;
}
