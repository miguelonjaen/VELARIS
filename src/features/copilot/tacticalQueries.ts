import type { AreaReport } from './areaAnalysis';
export type ChartQuery = (signal: AbortSignal) => Promise<AreaReport>;
let chartQuery: ChartQuery | null = null;
export function registerChartQuery(query: ChartQuery): () => void {
 chartQuery = query;
 return () => { if (chartQuery === query) chartQuery = null; };
}
export async function queryTacticalChart(): Promise<AreaReport> {
 if (!chartQuery) throw new Error('Carta no visible: abra la carta para consultar su vista. No se ha consultado otra zona.');
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), 15000);
 try { return await chartQuery(controller.signal); } finally { clearTimeout(timer); }
}
export const QUERY_TOPICS = ['chart', 'navigation', 'instruments', 'ais', 'route', 'weather'] as const;
export type QueryTopic = typeof QUERY_TOPICS[number];
export function parseQueryTopics(value: unknown): QueryTopic[] {
 if (!Array.isArray(value) || value.length > QUERY_TOPICS.length || value.some(v => !QUERY_TOPICS.includes(v))) throw new Error('Plan de consultas inválido; no se han consultado datos.');
 return [...new Set(value)] as QueryTopic[];
}
