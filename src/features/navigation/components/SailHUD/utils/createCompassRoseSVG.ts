import { InstrumentGeometry } from "./InstrumentGeometry";

export function createCompassRoseSVG(
  g: InstrumentGeometry,
  heading: number
): string {

  const {
    size,
    center,

    compassOuterRadius,

    majorTickLength,
    mediumTickLength,
    minorTickLength,

    majorTickWidth,
    mediumTickWidth,
    minorTickWidth,

    labelRadius,
    cardinalRadius,

    outerRingStroke,
    innerRingStroke,

    hubOuterRadius,
    hubInnerRadius,
  } = g;

  let ticks = "";
  let labels = "";

  for (let i = 0; i < 72; i++) {

    const angle = i * 5;
    const rad = angle * Math.PI / 180;

    let tickLength = minorTickLength;
    let strokeWidth = minorTickWidth;

    if (angle % 90 === 0) {
      tickLength = majorTickLength;
      strokeWidth = majorTickWidth;
    }
    else if (angle % 30 === 0) {
      tickLength = mediumTickLength;
      strokeWidth = mediumTickWidth;
    }

    const outer = compassOuterRadius;
    const inner = outer - tickLength;

    const x1 = center + outer * Math.sin(rad);
    const y1 = center - outer * Math.cos(rad);

    const x2 = center + inner * Math.sin(rad);
    const y2 = center - inner * Math.cos(rad);

    ticks += `
<line
x1="${x1}"
y1="${y1}"
x2="${x2}"
y2="${y2}"
stroke="#22d3ee"
stroke-opacity="${angle % 90 === 0 ? 1 : angle % 30 === 0 ? .75 : .45}"
stroke-width="${strokeWidth}"/>
`;

    if (
      angle % 30 === 0 &&
      angle !== 0 &&
      angle !== 90 &&
      angle !== 180 &&
      angle !== 270
    ) {

      const lx = center + labelRadius * Math.sin(rad);
      const ly = center - labelRadius * Math.cos(rad);

      labels += `
<text
x="${lx}"
y="${ly}"
fill="#22d3ee"
fill-opacity=".75"
font-size="11"
font-family="Segoe UI"
font-weight="600"
text-anchor="middle"
dominant-baseline="middle">
${angle}
</text>
`;
    }
  }

  return `
<svg
xmlns="http://www.w3.org/2000/svg"
width="${size}"
height="${size}"
viewBox="0 0 ${size} ${size}"
style="
transform:rotate(${heading}deg);
overflow:visible;
">

<defs>

<filter id="velarisGlow">

<feGaussianBlur
stdDeviation="2"
result="blur"/>

<feMerge>

<feMergeNode in="blur"/>

<feMergeNode in="SourceGraphic"/>

</feMerge>

</filter>

</defs>

<circle
cx="${center}"
cy="${center}"
r="${compassOuterRadius}"
fill="none"
stroke="#22d3ee"
stroke-opacity=".55"
stroke-width="${outerRingStroke}"
filter="url(#velarisGlow)"/>

<circle
cx="${center}"
cy="${center}"
r="${g.compassInnerRadius}"
fill="none"
stroke="#22d3ee"
stroke-opacity=".18"
stroke-width="${innerRingStroke}"/>

${ticks}

${labels}

<text
x="${center}"
y="${center - cardinalRadius}"
fill="#22d3ee"
font-size="22"
font-family="Segoe UI"
font-weight="700"
text-anchor="middle"
dominant-baseline="middle">
N
</text>

<text
x="${center + cardinalRadius}"
y="${center}"
fill="#22d3ee"
font-size="18"
font-family="Segoe UI"
font-weight="700"
text-anchor="middle"
dominant-baseline="middle">
E
</text>

<text
x="${center}"
y="${center + cardinalRadius}"
fill="#22d3ee"
font-size="18"
font-family="Segoe UI"
font-weight="700"
text-anchor="middle"
dominant-baseline="middle">
S
</text>

<text
x="${center - cardinalRadius}"
y="${center}"
fill="#22d3ee"
font-size="18"
font-family="Segoe UI"
font-weight="700"
text-anchor="middle"
dominant-baseline="middle">
W
</text>

<circle
cx="${center}"
cy="${center}"
r="${hubOuterRadius}"
fill="rgba(34,211,238,.12)"
stroke="#22d3ee"
stroke-width="${outerRingStroke}"/>

<circle
cx="${center}"
cy="${center}"
r="${hubInnerRadius}"
fill="#22d3ee"/>

</svg>
`;
}