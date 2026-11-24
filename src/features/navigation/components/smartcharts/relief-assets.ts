import { validateGrid, type ReliefGrid } from './relief-model';
interface ReliefAsset extends Omit<ReliefGrid, 'values'> {
  encoding: string; data: string; navigationUse: boolean; verticalDatum: string; sha256: string;
}
/** A bounded decoder shared by the worker and tests. Never inflate an unbounded response. */
export async function decodeReliefAsset(input: unknown, expectedHash: string): Promise<ReliefGrid> {
  if (typeof input !== 'object' || input === null) throw new Error('Relieve no valido');
  const asset = input as ReliefAsset;
  if (asset.encoding !== 'gzip-int16-le' || asset.navigationUse !== false || asset.verticalDatum !== 'LAT' || typeof asset.data !== 'string' || asset.data.length > 2_000_000 || asset.sha256 !== expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('Formato de relieve no valido');
  const expected = asset.width * asset.height * 2;
  if (!Number.isSafeInteger(expected) || expected <= 0 || expected > 6_000_000) throw new Error('Relieve demasiado grande');
  const bytes = Uint8Array.from(atob(asset.data), c => c.charCodeAt(0));
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const output = new Uint8Array(expected); let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      if (length + chunk.value.length > expected) throw new Error('Relieve excede limite');
      output.set(chunk.value, length); length += chunk.value.length;
    }
  } finally { await reader.cancel(); }
  if (length !== expected) throw new Error('Relieve incompleto');
  const digest = await crypto.subtle.digest('SHA-256', output);
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== expectedHash) throw new Error('Integridad del relieve incorrecta');
  const view = new DataView(output.buffer), values = new Int16Array(expected / 2);
  for (let i = 0; i < values.length; i++) values[i] = view.getInt16(i * 2, true);
  const grid: ReliefGrid = { width: asset.width, height: asset.height, west: asset.west, north: asset.north, stepX: asset.stepX, stepY: asset.stepY, values };
  validateGrid(grid); return grid;
}
export interface ReliefResource { url: string; rawSha256: string }
export function reliefPackKey(x: number, y: number, zoom: number): string {
  if (zoom < 7) return 'overview';
  const scale = 2 ** (zoom - 7);
  return `7-${Math.floor(x / scale)}-${Math.floor(y / scale)}`;
}
