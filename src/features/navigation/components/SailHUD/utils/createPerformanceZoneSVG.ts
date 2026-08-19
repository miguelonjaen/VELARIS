import { InstrumentGeometry } from "./InstrumentGeometry";

export function createPerformanceZoneSVG(
  g: InstrumentGeometry,
  heading: number,
  twd: number
): string {

  const {
    size,
    center,

    performanceZoneInnerRadius,
    performanceZoneOuterRadius,

    performanceZoneStroke,
    performanceZoneWidth,
  } = g;

  // TODO: vendrá del PolarEngine
  const optimalAngle = 42;

  const relativeWind =
    (twd - heading + 360) % 360;

  function createArc(angle: number) {

    const start =
      (angle - performanceZoneWidth) * Math.PI / 180;

    const end =
      (angle + performanceZoneWidth) * Math.PI / 180;

    const x1 =
      center +
      performanceZoneOuterRadius * Math.sin(start);

    const y1 =
      center -
      performanceZoneOuterRadius * Math.cos(start);

    const x2 =
      center +
      performanceZoneOuterRadius * Math.sin(end);

    const y2 =
      center -
      performanceZoneOuterRadius * Math.cos(end);

    const x3 =
      center +
      performanceZoneInnerRadius * Math.sin(end);

    const y3 =
      center -
      performanceZoneInnerRadius * Math.cos(end);

    const x4 =
      center +
      performanceZoneInnerRadius * Math.sin(start);

    const y4 =
      center -
      performanceZoneInnerRadius * Math.cos(start);

    return `
<path
d="
M ${x1} ${y1}
A ${performanceZoneOuterRadius} ${performanceZoneOuterRadius} 0 0 1 ${x2} ${y2}
L ${x3} ${y3}
A ${performanceZoneInnerRadius} ${performanceZoneInnerRadius} 0 0 0 ${x4} ${y4}
Z
"
fill="rgba(34,197,94,.28)"
stroke="rgba(34,197,94,.55)"
stroke-width="${performanceZoneStroke}"
/>
`;
  }

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

${createArc(relativeWind - optimalAngle)}

${createArc(relativeWind + optimalAngle)}

</svg>
`;
}