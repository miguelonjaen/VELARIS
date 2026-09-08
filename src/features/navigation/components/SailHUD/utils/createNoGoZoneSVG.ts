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

  const normalizeBearing = (bearing: number): number =>
    ((bearing % 360) + 360) % 360;

  // The no-go sector is centered on the apparent direction of the wind source.
  const relativeWind =
    normalizeBearing(normalizeBearing(twd) - normalizeBearing(heading));

  // The SVG canvas is north-up; convert the boat-relative wind angle back
  // to the absolute bearing expected by the renderer.
  const finalRenderAngle =
    normalizeBearing(relativeWind + normalizeBearing(heading));

  const startAngle =
    finalRenderAngle - noGoAngle;

  const endAngle =
    finalRenderAngle + noGoAngle;

  console.log('[NO-GO ANGLE DEBUG]', {
    twdFrom: normalizeBearing(twd),
    heading: normalizeBearing(heading),
    relativeWind,
    windTo: normalizeBearing(twd + 180),
    finalRenderAngle,
    noGoStart: startAngle,
    noGoEnd: endAngle
  });

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