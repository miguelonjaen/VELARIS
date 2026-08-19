import { InstrumentGeometry } from "./InstrumentGeometry";

export function createWaypointBeamSVG(
  g: InstrumentGeometry,
  heading: number,
  waypointBearing: number
): string {

  const {
    size,
    center,

    waypointBeamStartRadius,
    waypointBeamEndRadius,
    waypointBeamStroke,

    waypointArrowOffset,
    waypointArrowLength,
    waypointArrowWidth,
  } = g;

  const relativeAngle =
    (waypointBearing - heading + 360) % 360;

  const rad = relativeAngle * Math.PI / 180;

  const startX =
    center +
    waypointBeamStartRadius * Math.sin(rad);

  const startY =
    center -
    waypointBeamStartRadius * Math.cos(rad);

  const beamLength =
    waypointBeamEndRadius - waypointArrowOffset;

  const endX =
    center +
    beamLength * Math.sin(rad);

  const endY =
    center -
    beamLength * Math.cos(rad);

  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);

  const px = -dy;
  const py = dx;

  const baseX = endX - dx * waypointArrowLength;
  const baseY = endY - dy * waypointArrowLength;

  const leftX = baseX + px * waypointArrowWidth;
  const leftY = baseY + py * waypointArrowWidth;

  const rightX = baseX - px * waypointArrowWidth;
  const rightY = baseY - py * waypointArrowWidth;

  return `
<svg
width="${size}"
height="${size}"
style="
position:absolute;
left:0;
top:0;
overflow:visible;
pointer-events:none;
">

<line
x1="${startX}"
y1="${startY}"
x2="${endX}"
y2="${endY}"
stroke="#ff3bf5"
stroke-width="${waypointBeamStroke}"
opacity=".80"
stroke-linecap="round"
/>

<polygon
points="
${endX},${endY}
${leftX},${leftY}
${rightX},${rightY}
"
fill="#ff3bf5"
opacity=".95"
/>

</svg>
`;
}