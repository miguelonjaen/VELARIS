import type { PolarTargets } from '../../../../core/navigation/BoatPolar';
import { sailHudBearings } from './utils/sailHudBearings';
import React from "react";
import { Marker } from "react-leaflet";
import L from "leaflet";
import { createBoatSVG } from "./utils/createBoatSVG";

import { createInstrumentGeometry } from "./utils/InstrumentGeometry";
import { createCompassRoseSVG } from "./utils/createCompassRoseSVG";
import { createWaypointBeamSVG } from "./utils/createWaypointBeamSVG";
import { createWindNeedleSVG } from "./utils/createWindNeedleSVG";
import { createNoGoZoneSVG } from "./utils/createNoGoZoneSVG";
import { createInstrumentLaylinesSVG } from "./utils/createInstrumentLaylinesSVG";
import { createBearingBugSVG } from "./utils/createBearingBugSVG";
import { createTacticalCoreSVG } from "./utils/createTacticalCoreSVG";
import { createPerformanceZoneSVG } from "./utils/createPerformanceZoneSVG";
import { createPerformanceArcSVG } from "./utils/createPerformanceArcSVG";

interface SailHUDLayerProps {
  shipPosition: { lat: number; lng: number } | null;
  heading?: number;
  twd?: number;
  polarTargets?: PolarTargets | null;
  relativeWindAngle?: number;
  windReference?: 'TWA' | 'AWA';
  waypointBearing?: number;
}

const SailHUDLayer: React.FC<SailHUDLayerProps> = ({
  shipPosition,
  heading = 0,
  twd,
  polarTargets,
  relativeWindAngle,
  waypointBearing,
}) => {
  if (!shipPosition) return null;

  const size = 320;
  const bearings = sailHudBearings(heading, twd, relativeWindAngle, waypointBearing);
  const hasWind = bearings.wind !== null;
  const windHeading = 0;
  const windAngle = bearings.wind ?? 0;
  const waypointAngle = bearings.waypoint ?? 0;
  const hasWaypoint = bearings.waypoint !== null;


  // ============================================================
  // INSTRUMENT GEOMETRY
  // ============================================================

  const g = createInstrumentGeometry(size);

  // ============================================================
  // NO GO ZONE
  // ============================================================

  const noGoZone = hasWind ? createNoGoZoneSVG(g, windHeading, windAngle) : "";

  // ============================================================
  // TACTICAL CORE
  // ============================================================

  const tacticalCore =
createTacticalCoreSVG(g);

  // ============================================================
  // PERFORMANCE ZONE
  // ============================================================

  const performanceZone = hasWind && hasWaypoint && polarTargets ? createPerformanceZoneSVG(g, windHeading, windAngle, polarTargets.upwindAngle) : "";

  // ============================================================
  // PERFORMANCE ARC
  // ============================================================

  const performanceArc = hasWind && hasWaypoint && polarTargets ? createPerformanceArcSVG(g, windHeading, windAngle, polarTargets.upwindAngle) : "";

  // ============================================================
  // COMPASS ROSE
  // ============================================================

  const compass = createCompassRoseSVG(g, 0);
  const boat = createBoatSVG(
  g,
  heading
);

  // ============================================================
  // LUBBER LINE
  // ============================================================

  const lubber = `
<div
style="
position:absolute;
left:50%;
top:22px;
transform:translateX(-50%);
width:2px;
height:${g.outerRadius}px;
background:#22d3ee;
opacity:.9;
box-shadow:0 0 8px rgba(34,211,238,.55);
">
</div>

<div
style="
position:absolute;
left:50%;
top:10px;
transform:translateX(-50%);
width:0;
height:0;
border-left:5px solid transparent;
border-right:5px solid transparent;
border-bottom:9px solid #22d3ee;
filter:drop-shadow(0 0 6px rgba(34,211,238,.8));
">
</div>
`;

  // ============================================================
  // TRUE WIND NEEDLE
  // ============================================================

  const wind = hasWind ? createWindNeedleSVG(g, windHeading, windAngle) : "";

  // ============================================================
  // WAYPOINT BEAM
  // ============================================================

  const waypoint = hasWaypoint ? createWaypointBeamSVG(g, 0, waypointAngle) : "";

  // ============================================================
  // BEARING BUG
  // ============================================================

  const bearingBug = hasWaypoint ? createBearingBugSVG(g, 0, waypointAngle) : "";
  // ============================================================
  // LAYLINES
  // ============================================================

  // 45° without a polar is a visual bearing reference, never a tactical solution.
  const laylines = hasWind && polarTargets ? createInstrumentLaylinesSVG(g, windHeading, windAngle, polarTargets.upwindAngle) : "";

  // ============================================================
  // POLAR
  // ============================================================

  const polar = ``;

  // ============================================================
  // VMG
  // ============================================================

  const vmg = ``;

  // ============================================================
  // HUD
  // ============================================================

  const html = `
<div
style="
position:relative;
width:${size}px;
height:${size}px;
pointer-events:none;
">

${noGoZone}

${performanceArc}

${performanceZone}

${tacticalCore}

${compass}

${boat}

${lubber}

${wind}

${waypoint}

${bearingBug}

${laylines}

${polar}

${vmg}


</div>
`;

  return (
    <Marker
      position={[shipPosition.lat, shipPosition.lng]}
      interactive={false}
      zIndexOffset={1000}
      icon={L.divIcon({
        className: "",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html,
      })}
    />
  );
};

export default SailHUDLayer;