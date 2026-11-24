function getUpwindAngle(tws: number): number {

  if (tws < 8) return 42;

  if (tws < 14) return 40;

  if (tws < 20) return 38;

  return 36;

}

export function createLaylinesSVG(
  size: number,
  twd: number,
  tws: number
): string {

  const center = size / 2;

  const radius = size * 0.34;

  const targetTack = getUpwindAngle(tws);

  const portRad = (twd - targetTack) * Math.PI / 180;

  const stbdRad = (twd + targetTack) * Math.PI / 180;

  const length = radius * 0.88;

  const portX = center + length * Math.sin(portRad);
  const portY = center - length * Math.cos(portRad);

  const stbdX = center + length * Math.sin(stbdRad);
  const stbdY = center - length * Math.cos(stbdRad);

  return `
<svg
style="
position:absolute;
left:0;
top:0;
overflow:visible;
"
width="${size}"
height="${size}">

<line
x1="${center}"
y1="${center}"
x2="${portX}"
y2="${portY}"
stroke="#ef4444"
stroke-width="2"
stroke-dasharray="8,6"
opacity=".55"
/>

<line
x1="${center}"
y1="${center}"
x2="${stbdX}"
y2="${stbdY}"
stroke="#22c55e"
stroke-width="2"
stroke-dasharray="8,6"
opacity=".55"
/>

</svg>
`;
}