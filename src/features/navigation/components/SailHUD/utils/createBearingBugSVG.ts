import { InstrumentGeometry } from "./InstrumentGeometry";

export function createBearingBugSVG(
  g: InstrumentGeometry,
  heading: number,
  waypointBearing: number
): string {

  const {
    size,
    center,

    bearingBugRadius,
    bearingBugLineLength,
    bearingBugLineOffset,

    bearingBugWidth,
    bearingBugHeight,

    bearingBugStroke,
  } = g;

  const angle =
    (waypointBearing - heading + 360) % 360;

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

<g
transform="
translate(${center} ${center})
rotate(${angle})
"
>

<line
x1="0"
y1="${-(bearingBugRadius + bearingBugLineOffset + bearingBugLineLength)}"
x2="0"
y2="${-(bearingBugRadius - bearingBugLineOffset)}"
stroke="#ff3bf5"
stroke-width="${bearingBugStroke}"
stroke-linecap="round"
/>

<polygon
points="
0,${-(bearingBugRadius - bearingBugLineOffset + bearingBugHeight)}
-${bearingBugWidth},${-(bearingBugRadius + bearingBugHeight)}
${bearingBugWidth},${-(bearingBugRadius + bearingBugHeight)}
"
fill="#ff3bf5"
opacity=".95"
/>

</g>

</svg>
`;
}