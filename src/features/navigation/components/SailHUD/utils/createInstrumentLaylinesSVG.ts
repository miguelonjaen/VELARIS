import { InstrumentGeometry } from "./InstrumentGeometry";

export function createInstrumentLaylinesSVG(
  g: InstrumentGeometry,
  heading: number,
  twd: number
): string {

  const {
    size,
    center,

    laylineStartRadius,
    laylineEndRadius,
    laylineMarkerRadius,

    laylineStroke,
    laylineMarkerSize,
    laylineDash,
  } = g;

  // TODO: vendrá del PolarEngine
  const laylineAngle = 42;

  const relativeWind =
    (twd - heading + 360) % 360;

  const portAngle =
    (relativeWind - laylineAngle) * Math.PI / 180;

  const starboardAngle =
    (relativeWind + laylineAngle) * Math.PI / 180;

  // -----------------------------
  // Babor
  // -----------------------------

  const x1p =
    center +
    laylineStartRadius * Math.sin(portAngle);

  const y1p =
    center -
    laylineStartRadius * Math.cos(portAngle);

  const x2p =
    center +
    laylineEndRadius * Math.sin(portAngle);

  const y2p =
    center -
    laylineEndRadius * Math.cos(portAngle);

  const xp =
    center +
    laylineMarkerRadius * Math.sin(portAngle);

  const yp =
    center -
    laylineMarkerRadius * Math.cos(portAngle);

  // -----------------------------
  // Estribor
  // -----------------------------

  const x1s =
    center +
    laylineStartRadius * Math.sin(starboardAngle);

  const y1s =
    center -
    laylineStartRadius * Math.cos(starboardAngle);

  const x2s =
    center +
    laylineEndRadius * Math.sin(starboardAngle);

  const y2s =
    center -
    laylineEndRadius * Math.cos(starboardAngle);

  const xs =
    center +
    laylineMarkerRadius * Math.sin(starboardAngle);

  const ys =
    center -
    laylineMarkerRadius * Math.cos(starboardAngle);

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
x1="${x1p}"
y1="${y1p}"
x2="${x2p}"
y2="${y2p}"
stroke="#22d3ee"
stroke-width="${laylineStroke}"
opacity=".75"
stroke-dasharray="${laylineDash}"
/>

<line
x1="${x1s}"
y1="${y1s}"
x2="${x2s}"
y2="${y2s}"
stroke="#22d3ee"
stroke-width="${laylineStroke}"
opacity=".75"
stroke-dasharray="${laylineDash}"
/>

<circle
cx="${xp}"
cy="${yp}"
r="${laylineMarkerSize}"
fill="#22d3ee"
opacity=".90"
/>

<circle
cx="${xs}"
cy="${ys}"
r="${laylineMarkerSize}"
fill="#22d3ee"
opacity=".90"
/>

</svg>
`;
}