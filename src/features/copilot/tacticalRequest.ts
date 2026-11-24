import type { AreaReport } from './areaAnalysis';
import { QUERY_TOPICS, type QueryTopic } from './tacticalQueries';
export const ROUTING_LIMIT = 'GAULOS dispone de un planificador geométrico experimental de tramos exteriores con SmartCHARTS. La planificación se interpreta en el flujo conversacional de propuestas; una consulta de la vista visible no calcula ni valida una derrota. Los accesos portuarios, ENC, batimetría, calado, obstáculos y restricciones operativas siguen pendientes.';
/** Selects read-only evidence, never interprets a phrase as authority to execute actions. */
export function isRouteOrHazardRequest(order: string): boolean {
  return /\b(ruta|derrota|navegar|naveguemos|peligros?|costa|motril)\b/i.test(order);
}
export function requiredReadOnlyTopics(order: string): QueryTopic[] {
  const text = order.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const topics = new Set<QueryTopic>();

  if (/\b(carta|enc|batimetria|costa|boya|faro|peligro|obstaculo|sonda cartografica|motril)\b/.test(text)) {
    topics.add('chart');
  }

  if (/\b(posicion|gps|sog|cog|rumbo|velocidad|heading|hdg|navegacion)\b/.test(text)) {
    topics.add('navigation');
  }

  if (/\b(sonda|profundidad|instrumento|sensor|calado|stw)\b/.test(text)) {
    topics.add('instruments');
  }

  if (/\b(ais|barco|buque|trafico|objetivo|cpa|tcpa|colision)\b/.test(text)) {
    topics.add('ais');
  }

  if (/\b(ruta|derrota|destino|waypoint|travesia|navegar|naveguemos)\b/.test(text)) {
    topics.add('route');
  }

  if (/\b(viento|meteo|meteorologia|oleaje|corriente|tws|twa|twd|racha|presion)\b/.test(text)) {
    topics.add('weather');
  }

  if (isRouteOrHazardRequest(order)) {
    return ['chart', 'route', 'navigation', 'instruments', 'ais', 'weather'];
  }

  return topics.size ? [...topics] : [...QUERY_TOPICS];
}
export function localChartSummary(report: AreaReport): string {
  const hazards = report.objects.filter(o => o.category === 'hazard');
  return [
    'Consulta local de SOLO LA VISTA VISIBLE (no todo el trayecto ni necesariamente el destino mencionado).',
    `Envolvente [oeste,sur,este,norte]: ${JSON.stringify(report.bbox)}. Consulta: ${new Date(report.queriedAt).toISOString()} (no fecha de actualización ENC).`,
    `ENC: ${report.enc}; cobertura: ${report.coverage}; calidad: ${report.quality}. Candidatos: ${report.total}; listado truncado: ${report.truncated}.`,
    ...hazards.slice(0, 8).map(o => `Peligro candidato: ${JSON.stringify({ id: o.id, name: o.name.slice(0, 100), kind: o.kind, source: o.source })}`),
    `Mostrados ${Math.min(8, hazards.length)} de ${hazards.length} peligros en el listado local. Ausencia de objetos no acredita aguas libres.`,
    ...report.issues.slice(0, 8).map(issue => `Límite de datos: ${issue.slice(0, 250)}`), ROUTING_LIMIT,
  ].join('\n');
}
