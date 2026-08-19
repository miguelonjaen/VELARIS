import { InstrumentGeometry } from "./InstrumentGeometry";

export function createWindNeedleSVG(
  g: InstrumentGeometry,
  heading: number,
  twd: number
): string {

 const {
  size,
  center,
  boatRadius,

  windNeedleEndRadius,

  windNeedleLength,
  windNeedleWidth,
  windNeedleStroke,
  windNeedleHubRadius,
} = g;

  const relativeAngle = (twd - heading + 360) % 360;
  const rad = relativeAngle * Math.PI / 180;

  const x1 =
    center +
    boatRadius * Math.sin(rad);

  const y1 =
    center -
    boatRadius * Math.cos(rad);

  const x2 =
  center +
  windNeedleEndRadius * Math.sin(rad);

const y2 =
  center -
  windNeedleEndRadius * Math.cos(rad);
  
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
x1="${x1}"
y1="${y1}"
x2="${x2}"
y2="${y2}"
stroke="#bffcff"
stroke-width="${windNeedleStroke}"
stroke-linecap="round"
opacity=".95"
/>

<polygon
points="
0,0
-${windNeedleWidth},-${windNeedleLength}
${windNeedleWidth},-${windNeedleLength}
"
fill="#bffcff"
opacity=".95"
transform="
translate(${x2} ${y2})
rotate(${relativeAngle})
"
/>

<circle
cx="${x1}"
cy="${y1}"
r="${windNeedleHubRadius}"
fill="#bffcff"
opacity=".85"
/>

</svg>
`;
}