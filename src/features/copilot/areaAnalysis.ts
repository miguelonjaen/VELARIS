import type { Feature, Geometry, Position } from 'geojson';

export type Bounds = readonly [number, number, number, number];
export type ChartFeature = Feature<Geometry, Record<string, unknown>>;
export interface ChartObject {
  id: string;
  name: string;
  kind: string;
  source: 'ENC' | 'OSM';
  category: 'hazard' | 'aid' | 'coverage' | 'quality' | 'other';
  attributes: Readonly<Record<string, unknown>>;
  feature: ChartFeature;
}
export interface AreaReport {
  bbox: Bounds;
  queriedAt: number;
  objects: ChartObject[];
  total: number;
  truncated: boolean;
  issues: string[];
  enc: 'available' | 'unavailable' | 'error';
  encFilename?: string;
  coverage: 'objects-available' | 'unknown';
  quality: 'objects-available' | 'unknown';
}
export function validBounds(b: Bounds): boolean {
  return b.every(Number.isFinite) && b[0] >= -180 && b[2] <= 180 && b[1] >= -90 && b[3] <= 90
    && b[0] < b[2] && b[1] < b[3];
}
/** Conservative spatial candidate test. Polygon holes and line intersections are NOT a safety clearance. */
export function geometryBounds(geometry: Geometry): Bounds | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      const [x, y] = value as Position;
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90) return;
      w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
    } else value.forEach(visit);
  };
  if (geometry.type === 'GeometryCollection') {
    for (const child of geometry.geometries) { const b = geometryBounds(child); if (b) { visit([b[0], b[1]]); visit([b[2], b[3]]); } }
  } else visit(geometry.coordinates);
  return Number.isFinite(w) ? [w, s, e, n] : null;
}
export const intersects = (a: Bounds, b: Bounds): boolean => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
export function category(kind: string): ChartObject['category'] {
  if (/^(WRECKS|UWTROC|OBSTRN|RESARE|wreck|rock|obstruction|restricted_area)$/.test(kind)) return 'hazard';
  if (kind === 'M_COVR') return 'coverage';
  if (kind === 'M_QUAL') return 'quality';
  if (/^(LIGHTS|BOY|BCN|DAYMAR|PILPNT)|^(buoy|beacon|light)/.test(kind)) return 'aid';
  return 'other';
}
export function analyseArea(bbox: Bounds, inputs: readonly { source: 'ENC' | 'OSM'; features: readonly ChartFeature[] }[], enc: AreaReport['enc'], issues: string[], now: number): AreaReport {
  if (!validBounds(bbox)) throw new Error('Zona inválida o cruce del antimeridiano: seleccione una vista local.');
  const found = new Map<string, ChartObject>();
  for (const input of inputs) input.features.forEach((feature, index) => {
    if (!feature.geometry || !feature.properties) return;
    const bounds = geometryBounds(feature.geometry);
    if (!bounds || !intersects(bounds, bbox)) return;
    const p = feature.properties;
    const kind = String(input.source === 'ENC' ? p.__s57Layer ?? 'UNKNOWN' : p.kind ?? 'unknown');
    const id = `${input.source}:${kind}:${String(p.LNAM ?? feature.id ?? p.osmId ?? index)}`;
    found.set(id, { id, name: String(p.OBJNAM ?? p.name ?? kind), kind, source: input.source, category: category(kind), attributes: p, feature });
  });
  const objects = [...found.values()].sort((a, b) => {
    const rank = { hazard: 0, aid: 1, coverage: 2, quality: 3, other: 4 };
    return rank[a.category] - rank[b.category] || a.id.localeCompare(b.id);
  });
  return { bbox, queriedAt: now, total: objects.length, truncated: objects.length > 200, objects: objects.slice(0, 200), enc, issues,
    coverage: objects.some(o => o.category === 'coverage') ? 'objects-available' : 'unknown',
    quality: objects.some(o => o.category === 'quality') ? 'objects-available' : 'unknown' };
}
export interface Advisory { id: string; priority: 'warning' | 'info'; text: string }
export function areaAdvisories(report: AreaReport): Advisory[] {
  const hazards = report.objects.filter(o => o.category === 'hazard');
  return [
    ...(hazards.length ? [{ id: 'chart-hazards', priority: 'warning' as const, text: `${hazards.length} candidatos de peligro/restricción en la selección. Verifique geometría y atributos.` }] : []),
    ...(report.coverage === 'unknown' ? [{ id: 'coverage-unknown', priority: 'warning' as const, text: 'Cobertura ENC no acreditada para toda la zona; ausencia de objetos no implica aguas libres.' }] : []),
    ...(report.quality === 'unknown' ? [{ id: 'quality-unknown', priority: 'info' as const, text: 'Calidad del levantamiento no disponible (M_QUAL/CATZOC).' }] : [])
  ];
}
/** Emits transitions only, including recovery and reappearance; no timer-dependent alert spam. */
export class AdvisoryTransitions {
  private active = new Set<string>();
  update(items: readonly Advisory[]): Advisory[] {
    const fresh = items.filter(item => !this.active.has(item.id));
    this.active = new Set(items.map(item => item.id));
    return fresh;
  }
}
