export interface FlowRaster {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  readonly valid: number;
}
/** Presentation only: yield to wheel/click events and abandon obsolete viewports. */
export async function rasterizeFlow(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => readonly [number, number, number] | null,
  current: () => boolean,
  yieldTask: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 0)),
  clock: () => number = () => performance.now()
): Promise<FlowRaster | null> {
  const pixels = new Uint8ClampedArray(width * height * 4);
  let valid = 0, sliceStart = clock();
  for (let index = 0; index < width * height; index++) {
    if (index % 128 === 0) {
      if (!current()) return null;
      if (clock() - sliceStart >= 4) {
        await yieldTask();
        if (!current()) return null;
        sliceStart = clock();
      }
    }
    const color = colorAt(index % width, Math.floor(index / width));
    if (!color) continue;
    const offset = index * 4;
    pixels[offset] = color[0]; pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2]; pixels[offset + 3] = 255;
    valid++;
  }
  return current() ? { width, height, pixels, valid } : null;
}
