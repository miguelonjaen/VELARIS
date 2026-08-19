import { InstrumentGeometry } from "./InstrumentGeometry";

export function createPerformanceArcSVG(
  g: InstrumentGeometry,
  heading: number,
  twd: number
): string {

  const {
    size,
    center,

    performanceArcOuterRadius,
    performanceArcInnerRadius,

    performanceArcStroke,
    performanceArcWidth,
  } = g;

  // TODO: vendrá del PolarEngine
  const optimalAngle = 42;

  const relativeWind =
    (twd - heading + 360) % 360;

  function createZone(angle: number): string {

    const start =
      (angle - performanceArcWidth) * Math.PI / 180;

    const end =
      (angle + performanceArcWidth) * Math.PI / 180;

    const x1 =
      center +
      performanceArcOuterRadius * Math.sin(start);

    const y1 =
      center -
      performanceArcOuterRadius * Math.cos(start);

    const x2 =
      center +
      performanceArcOuterRadius * Math.sin(end);

    const y2 =
      center -
      performanceArcOuterRadius * Math.cos(end);

    const x3 =
      center +
      performanceArcInnerRadius * Math.sin(end);

    const y3 =
      center -
      performanceArcInnerRadius * Math.cos(end);

    const x4 =
      center +
      performanceArcInnerRadius * Math.sin(start);

    const y4 =
      center -
      performanceArcInnerRadius * Math.cos(start);

    return `
<path
d="
M ${x1} ${y1}
A ${performanceArcOuterRadius} ${performanceArcOuterRadius} 0 0 1 ${x2} ${y2}
L ${x3} ${y3}
A ${performanceArcInnerRadius} ${performanceArcInnerRadius} 0 0 0 ${x4} ${y4}
Z
"
fill="rgba(74,222,128,0.18)"
stroke="rgba(74,222,128,0.35)"
stroke-width="${performanceArcStroke}"
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

${createZone(relativeWind - optimalAngle)}

${createZone(relativeWind + optimalAngle)}

</svg>
`;
}