/** Language is interpreted by Ollama; this module only validates its bounded data contract. */
export const TARGET_PASSAGE_TOLERANCE_NM = 0.05; // Operator-approved target band, not a safety margin.
export interface RouteReferenceIntent {
  name: string;
  kind: 'PORT' | 'ISLAND' | 'CAPE' | 'PLACE';
  mode: 'PASS' | 'CALL' | 'UNSPECIFIED';
  distanceNm: number | null;
}
export interface RouteSpecification {
  origin: string | null;
  destination: string | null;
  via: RouteReferenceIntent[];
  coastDistanceNm: number | null;
  unhandledConstraints: string[];
}
export interface RouteInterpretation {
  domain: 'ROUTE' | 'OTHER';
  action: 'CREATE' | 'MODIFY' | 'QUERY' | 'CLARIFY' | 'NONE';
  origin: string | null;
  destination: string | null;
  /** null preserves existing references; [] explicitly removes them on modification. */
  via: RouteReferenceIntent[] | null;
  coastDistance: { operation: 'KEEP' | 'SET' | 'INCREASE'; nm: number | null };
  unhandledConstraints: string[];
  wantsTotalDistance: boolean;
  question: string | null;
}
export interface RouteInterpretationContext {
  spec: RouteSpecification | null;
  hasCalculatedProposal: boolean;
}
const record = (value: unknown): value is Record<string,unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value: Record<string,unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).length === allowed.length && allowed.every(k=>Object.hasOwn(value,k));
}
const place = (v:unknown): boolean => v === null || typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
const distance = (v:unknown): boolean => v === null || typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 100;
export function parseRouteInterpretation(input: unknown): RouteInterpretation {
  const invalid = (): never => { throw new Error('ROUTE_CONVERSATION_INVALID_RESPONSE'); };
  if (!record(input) || !keys(input,['domain','action','origin','destination','via','coastDistance','unhandledConstraints','wantsTotalDistance','question'])) return invalid();
  if (!['ROUTE','OTHER'].includes(String(input.domain)) || !['CREATE','MODIFY','QUERY','CLARIFY','NONE'].includes(String(input.action)) ||
      !place(input.origin) || !place(input.destination) || !record(input.coastDistance) ||
      !keys(input.coastDistance,['operation','nm']) || !['KEEP','SET','INCREASE'].includes(String(input.coastDistance.operation)) ||
      !distance(input.coastDistance.nm) || (input.coastDistance.operation === 'KEEP') !== (input.coastDistance.nm === null) ||
      !Array.isArray(input.unhandledConstraints) || input.unhandledConstraints.length > 20 ||
      !input.unhandledConstraints.every(v=>typeof v === 'string' && v.trim().length > 0 && v.length <= 500) ||
      typeof input.wantsTotalDistance !== 'boolean' || !(input.question === null || typeof input.question === 'string' && input.question.length <= 400)) return invalid();
  if (input.via !== null && (!Array.isArray(input.via) || input.via.length > 20 || !input.via.every(v=>
      record(v) && keys(v,['name','kind','mode','distanceNm']) && typeof v.name === 'string' && v.name.trim().length > 0 && v.name.length <= 200 &&
      ['PORT','ISLAND','CAPE','PLACE'].includes(String(v.kind)) && ['PASS','CALL','UNSPECIFIED'].includes(String(v.mode)) && distance(v.distanceNm)))) return invalid();
  // A query or a non-route classification cannot carry a hidden route mutation.
  if ((input.domain === 'OTHER' || input.action === 'QUERY' || input.action === 'NONE') &&
      (input.origin !== null || input.destination !== null || input.via !== null || input.coastDistance.operation !== 'KEEP' || input.unhandledConstraints.length > 0)) return invalid();
  if (input.domain === 'OTHER' && (input.action !== 'NONE' || input.wantsTotalDistance || input.question !== null)) return invalid();
  return structuredClone(input) as unknown as RouteInterpretation;
}
