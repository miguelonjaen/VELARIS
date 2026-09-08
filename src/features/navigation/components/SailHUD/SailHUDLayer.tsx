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
  waypointBearing?: number;
}

const SailHUDLayer: React.FC<SailHUDLayerProps> = ({
  shipPosition,
  heading = 0,
  twd = 0,
  waypointBearing = 0,
}) => {
  if (!shipPosition) return null;

  const size = 320;

  // ============================================================
  // INSTRUMENT GEOMETRY
  // ============================================================

  const g = createInstrumentGeometry(size);

  // ============================================================
  // NO GO ZONE
  // ============================================================

  const noGoZone = createNoGoZoneSVG(
  g,
  heading,
  twd
);

  // ============================================================
  // TACTICAL CORE
  // ============================================================

  const tacticalCore =
createTacticalCoreSVG(g);

  // ============================================================
  // PERFORMANCE ZONE
  // ============================================================

  const performanceZone =
  createPerformanceZoneSVG(
    g,
    heading,
    twd
  );

  // ============================================================
  // PERFORMANCE ARC
  // ============================================================

  const performanceArc =
createPerformanceArcSVG(
    g,
    heading,
    twd
);

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

  const wind = createWindNeedleSVG(
  g,
  heading,
  twd
);

  // ============================================================
  // WAYPOINT BEAM
  // ============================================================

  const waypoint = createWaypointBeamSVG(
  g,
  heading,
  waypointBearing
);

  // ============================================================
  // BEARING BUG
  // ============================================================

  const bearingBug = createBearingBugSVG(
  g,
  heading,
  waypointBearing
);
  // ============================================================
  // LAYLINES
  // ============================================================

  const laylines = createInstrumentLaylinesSVG(
  g,
  heading,
  twd
);

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