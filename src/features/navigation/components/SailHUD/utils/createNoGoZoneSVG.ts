import { InstrumentGeometry } from "./InstrumentGeometry";

export function createNoGoZoneSVG(
  g: InstrumentGeometry,
  heading: number,
  twd: number
): string {

  const {
    size,
    center,

    noGoOuterRadius,
    noGoInnerRadius,

    noGoStroke,
  } = g;

  // TODO: vendrá del PolarEngine
  const noGoAngle = 50;

  const relativeWind =
    (twd - heading + 360) % 360;

  const startAngle =
    relativeWind - noGoAngle;

  const endAngle =
    relativeWind + noGoAngle;

  const start =
    startAngle * Math.PI / 180;

  const end =
    endAngle * Math.PI / 180;

  const x1o =
    center +
    noGoOuterRadius * Math.sin(start);

  const y1o =
    center -
    noGoOuterRadius * Math.cos(start);

  const x2o =
    center +
    noGoOuterRadius * Math.sin(end);

  const y2o =
    center -
    noGoOuterRadius * Math.cos(end);

  const x2i =
    center +
    noGoInnerRadius * Math.sin(end);

  const y2i =
    center -
    noGoInnerRadius * Math.cos(end);

  const x1i =
    center +
    noGoInnerRadius * Math.sin(start);

  const y1i =
    center -
    noGoInnerRadius * Math.cos(start);

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

<path
d="
M ${x1o} ${y1o}

A ${noGoOuterRadius} ${noGoOuterRadius}
0 0 1
${x2o} ${y2o}

L ${x2i} ${y2i}

A ${noGoInnerRadius} ${noGoInnerRadius}
0 0 0
${x1i} ${y1i}

Z
"
fill="rgba(255,70,70,.32)"
stroke="rgba(255,140,140,.65)"
stroke-width="${noGoStroke}"
/>

</svg>
`;
}