import { InstrumentGeometry } from "./InstrumentGeometry";

export function createTacticalCoreSVG(
  g: InstrumentGeometry
): string {

  const {
    size,
    center,

    tacticalCoreRadius,
    tacticalCoreStroke,
  } = g;

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

<circle
cx="${center}"
cy="${center}"
r="${tacticalCoreRadius}"
fill="rgba(34,211,238,.045)"
stroke="rgba(34,211,238,.20)"
stroke-width="${tacticalCoreStroke}"
/>

</svg>
`;
}