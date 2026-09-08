import { InstrumentGeometry } from "./InstrumentGeometry";

export function createBoatSVG(
  g: InstrumentGeometry,
  heading: number
): string {

  const rotation =
    ((heading % 360) + 360) % 360;

  const boatWidth = g.radius * 0.11;
const boatHeight = g.radius * 0.25;

  const cx = g.center;
  const cy = g.center;

  return `
<svg
  width="${g.size}"
  height="${g.size}"
  viewBox="0 0 ${g.size} ${g.size}"
  style="
    position:absolute;
    left:0;
    top:0;
    width:${g.size}px;
    height:${g.size}px;
    pointer-events:none;
    overflow:visible;
    z-index:100;
  "
>
  <g
    transform="
      translate(${cx} ${cy})
      rotate(${rotation})
      translate(${-cx} ${-cy})
    "
  >

    <!-- ===================================================== -->
    <!-- BARCO -->
    <!-- ===================================================== -->

    <path
      d="
        M ${cx} ${cy - boatHeight / 2}
        C
          ${cx - boatWidth * 0.45} ${cy - boatHeight * 0.05},
          ${cx - boatWidth * 0.50} ${cy + boatHeight * 0.28},
          ${cx} ${cy + boatHeight / 2}
        C
          ${cx + boatWidth * 0.50} ${cy + boatHeight * 0.28},
          ${cx + boatWidth * 0.45} ${cy - boatHeight * 0.05},
          ${cx} ${cy - boatHeight / 2}
        Z
      "
      fill="#e5e7eb"
      stroke="#111827"
      stroke-width="${Math.max(1, g.radius * 0.008)}"
    />

    <!-- Cubierta -->
    <path
      d="
        M ${cx} ${cy - boatHeight * 0.28}
        L ${cx - boatWidth * 0.22} ${cy + boatHeight * 0.22}
        L ${cx + boatWidth * 0.22} ${cy + boatHeight * 0.22}
        Z
      "
      fill="#94a3b8"
      opacity="0.85"
    />

    <!-- Línea de crujía -->
    <line
      x1="${cx}"
      y1="${cy - boatHeight * 0.35}"
      x2="${cx}"
      y2="${cy + boatHeight * 0.35}"
      stroke="#334155"
      stroke-width="${Math.max(1, g.radius * 0.005)}"
    />

    <!-- Punto central -->
    <circle
      cx="${cx}"
      cy="${cy}"
      r="${Math.max(2, g.radius * 0.012)}"
      fill="#22d3ee"
      stroke="#0f172a"
      stroke-width="${Math.max(1, g.radius * 0.005)}"
    />

  </g>
</svg>
`;
}