import type { GeographicKind, GeographicResolution } from '../../shared/geographicReference';
import type { RoutePlace } from './routePlaces';
import { GeoMath } from '../../core/navigation/GeoMath';
import { resolveRoutePlace } from './routePlaces';
import { TARGET_PASSAGE_TOLERANCE_NM, parseRouteInterpretation, type RouteInterpretation, type RouteInterpretationContext, type RouteSpecification } from './routeIntent';
import type { RouteProposal, RouteProposalAnalysis } from './routeProposal';

export interface RouteConversationState { spec: RouteSpecification | null; pending: boolean }
export interface RouteConversationResult {
  handled: boolean;
  state: RouteConversationState;
  reply: string;
  proposal?: RouteProposal;
  diagnostic?: string;
}
export interface RouteConversationDependencies {
  interpret: (order: string, context: RouteInterpretationContext) => Promise<RouteInterpretation>;
  supportsIslandPassages?: true;
  resolve?: (name: string, kind: GeographicKind) => Promise<GeographicResolution>;
  generate: (spec: RouteSpecification, places?: RoutePlace[]) => Promise<RouteProposal>;
  analyze: (proposal: RouteProposal) => Promise<RouteProposalAnalysis>;
}
export function proposalDistanceNm(proposal: RouteProposal): number | null {
  if (!proposal.offshore || proposal.positions.length < 2) return null;
  let total = 0;
  for (let i = 1; i < proposal.positions.length; i++) {
    const a = proposal.positions[i-1], b = proposal.positions[i];
    if ([a,b].some(p=>!p.every(Number.isFinite) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) return null;
    total += GeoMath.distanceNM({lng:a[0],lat:a[1]},{lng:b[0],lat:b[1]});
  }
  return Number.isFinite(total) ? total : null;
}
export function specificationFromProposal(proposal: RouteProposal | null): RouteSpecification | null {
  if (!proposal) return null;
  return proposal.specification ?? {
    origin:proposal.places[0]?.name ?? null,
    destination:proposal.places[proposal.places.length-1]?.name ?? null,
    via:proposal.places.slice(1,-1).map(p=>({name:p.name,kind:'PORT',mode:proposal.offshore ? 'PASS' : 'UNSPECIFIED',distanceNm:null})),
    coastDistanceNm:proposal.requestedDistanceNm,unhandledConstraints:[...proposal.constraints]
  };
}
function merge(interpreted: RouteInterpretation, previous: RouteSpecification | null): RouteSpecification {
  const base = interpreted.action === 'CREATE' ? null : previous;
  const operation = interpreted.coastDistance;
  let distance = base?.coastDistanceNm ?? null;
  if (operation.operation === 'SET') distance = operation.nm;
  if (operation.operation === 'INCREASE') distance = distance === null ? null : distance + operation.nm!;
  return {
    origin:interpreted.origin ?? base?.origin ?? null,
    destination:interpreted.destination ?? base?.destination ?? null,
    via:structuredClone(interpreted.via ?? base?.via ?? []),
    coastDistanceNm:distance,
    unhandledConstraints:[...new Set([...(base?.unhandledConstraints ?? []),...interpreted.unhandledConstraints])]
  };
}
const formatNm = (n:number):string => n.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
function summary(spec: RouteSpecification): string {
  const via = spec.via.map(v=>v.distanceNm === null ? v.name : `${v.name} a ${v.distanceNm.toLocaleString('es-ES')} NM`).join(', ');
  return `${spec.origin ?? 'origen pendiente'} → ${spec.destination ?? 'destino pendiente'}${via ? `, pasando por ${via}` : ''}`;
}
/** The only effects available to this controller are draft generation and read-only analysis.
 * There is deliberately no active-navigation, autopilot or general-chat dependency.
 */
export async function handleRouteConversation(
  order: string, state: RouteConversationState, current: RouteProposal | null,
  services: RouteConversationDependencies
): Promise<RouteConversationResult> {
  const previous = state.pending ? state.spec : specificationFromProposal(current);
  let interpretation: RouteInterpretation;
  try {
    interpretation = parseRouteInterpretation(await services.interpret(order,{spec:previous,hasCalculatedProposal:Boolean(current?.offshore) && !state.pending}));
  } catch (error) {
    return {handled:true,state,reply:'No puedo interpretar la petición ahora porque el intérprete local no responde o ha devuelto datos no válidos. Mantengo la propuesta actual; no he enviado la orden al chat general.',
      diagnostic:error instanceof Error ? error.message : 'INTERPRETATION_FAILED'};
  }
  if (interpretation.domain === 'OTHER') return {handled:false,state,reply:''};
  const unchanged = (reply:string):RouteConversationResult => ({handled:true,state,reply});
  if (interpretation.action === 'NONE') return unchanged('Entendido. Mantengo la propuesta sin cambios.');
  if (interpretation.action === 'QUERY') {
    if (!current?.offshore || state.pending) return unchanged('La solicitud actual todavía no tiene una propuesta calculada. No puedo dar su distancia total a partir de referencias o de una propuesta anterior.');
    const distance = proposalDistanceNm(current);
    if (interpretation.wantsTotalDistance) return unchanged(distance === null ? 'No puedo medir la geometría de la propuesta actual.' :
      `La propuesta exterior suma ${formatNm(distance)} NM. Excluye los accesos portuarios de salida y llegada; no es una distancia de puerto a puerto validada.`);
    try {
      const analysis = await services.analyze(current);
      const minimum = analysis.clearance?.minimumDistanceMeters;
      return unchanged(`La propuesta visible tiene ${current.positions.length-1} tramos${distance === null ? '' : ` y ${formatNm(distance)} NM, excluidos los accesos portuarios`}. `+
        (minimum === null || minimum === undefined ? 'Separación a costa desconocida. ' : `Mínima separación geométrica a la costa cargada: ${formatNm(minimum/1852)} NM. `)+
        (analysis.referencePassages?.map(p=>`Paso ${p.name}: ${p.minimumDistanceNm === null ? 'mínimo desconocido' : formatNm(p.minimumDistanceNm)+' NM al contorno'}; ${p.status === 'WITHIN_BAND' ? 'dentro de banda geométrica' : p.status === 'OUTSIDE_BAND' ? 'FUERA DE BANDA; revisar la propuesta' : 'comprobación indeterminada'}. `).join('') ?? '')+
        'Es un borrador experimental: ENC, profundidades, obstáculos y restricciones operativas siguen pendientes.');
    } catch { return unchanged('No puedo actualizar el análisis de la propuesta visible. La mantengo sin cambios y no puedo considerarla validada.'); }
  }
  if (interpretation.action === 'CLARIFY') return unchanged(interpretation.question || '¿Qué cambio quieres hacer en la propuesta?');
  if (interpretation.action === 'MODIFY' && !previous) return unchanged('Todavía no hay una propuesta a la que aplicar ese cambio. Indícame origen y destino.');
  const spec = merge(interpretation,previous);
  if (interpretation.action === 'MODIFY' && JSON.stringify(spec) === JSON.stringify(previous)) {
    return unchanged('No he identificado un cambio concreto en la propuesta. ¿Qué destino, paso o separación quieres modificar?');
  }
  const nextState:RouteConversationState = {spec,pending:true};
  const pending = (reply:string, acknowledged=false):RouteConversationResult => ({handled:true,state:nextState,reply:reply+(spec.unhandledConstraints.length && !acknowledged ? ' También he conservado las condiciones adicionales sin verificar; no las eliminaré para calcular.' : '')});
  if (interpretation.question) return pending(interpretation.question);
  if (!spec.origin || !spec.destination) return pending(`He entendido ${summary(spec)}. ¿Cuál es ${!spec.origin ? 'el puerto de origen' : 'el puerto de destino'}?`);
  // Operator-approved target tolerance. It is not a hydrographic safety margin.
  const passageToleranceNm = TARGET_PASSAGE_TOLERANCE_NM;
  const targetPassages = spec.via.filter(v=>v.distanceNm !== null);
  const band = (distanceNm: number): string => `${Math.max(0,distanceNm-passageToleranceNm).toLocaleString('es-ES')}–${(distanceNm+passageToleranceNm).toLocaleString('es-ES')} NM`;
  const conflicting = targetPassages.filter(v=>v.kind === 'ISLAND' && spec.coastDistanceNm !== null && spec.coastDistanceNm > v.distanceNm!+passageToleranceNm);
  if (conflicting.length) return pending(`Hay un conflicto entre la separación general a costa de ${spec.coastDistanceNm!.toLocaleString('es-ES')} NM y el paso próximo a ${conflicting.map(v=>`${v.name} (${band(v.distanceNm!)})`).join(', ')}. `+
    'No aplicaré una excepción local automáticamente. ¿Quieres modificar la separación general o la distancia de paso? No he calculado esa derrota.');
  const names = [spec.origin,...spec.via.map(v=>v.name),spec.destination];
  const resolved: RoutePlace[] = [];
  const missing: string[] = [];
  const provenance = (): string => resolved.map(p=>`${p.name} [${p.kind ?? 'PORT'}]; ${p.datum}; ${p.source}; consulta ${p.verifiedOn}`).join('; ');
  for (const [index,name] of names.entries()) {
    try {
      if (!services.resolve) { resolved.push(resolveRoutePlace(name)); continue; }
      const kind: GeographicKind = index > 0 && index < names.length-1 ? spec.via[index-1].kind :
        /^puerto\b/i.test(name) ? 'PORT' : /^isla\b/i.test(name) ? 'ISLAND' : /^cabo\b/i.test(name) ? 'CAPE' : 'PLACE';
      const result = await services.resolve(name,kind);
      if (result.status !== 'RESOLVED' || result.candidates.length !== 1) {
        const choices = result.candidates.map(c=>`${c.name} [${c.kind ?? 'PLACE'}] — ${c.source}; ${c.attribution ?? 'fuente publicada'}`).join('; ');
        return pending(`Referencia «${name}»: ${result.message}${choices ? ` Candidatos: ${choices}.` : ''} La propuesta anterior se conserva.`);
      }
      if (result.cache === 'STALE') return pending(`«${name}» está en caché antigua (${result.candidates[0].verifiedOn}). Disponible para consulta offline; actualice la referencia antes de calcular una nueva propuesta.`);
      resolved.push(result.candidates[0]);
    } catch { missing.push(name); }
  }
  const scoped = spec.via.filter(v=>v.distanceNm !== null || v.kind === 'ISLAND' || v.kind === 'CAPE');
  const unsupported=scoped.filter(v=>!services.supportsIslandPassages || v.kind !== 'ISLAND' || v.distanceNm === null || v.mode !== 'PASS');
  if (unsupported.length) return pending(`He entendido ${summary(spec)}. La separación pedida a ${scoped.map(v=>v.name).join(', ')} es específica de esa referencia; no la aplicaré a toda la costa. `+
    `${targetPassages.length ? `El paso solicitado se interpreta como objetivo con tolerancia ±0,05 NM: ${targetPassages.map(v=>`${v.name}, banda ${band(v.distanceNm!)}`).join('; ')}. ` : ''}Ese tipo de paso o escala aún no está soportado para ${unsupported.map(v=>v.name).join(', ')}. El cálculo local disponible exige una isla identificada y paso exterior sin escala.${missing.length ? ` Además no he podido resolver posiciones verificables para ${[...new Set(missing)].join(', ')}.` : ''} `+
    'No he calculado esa derrota ni su distancia total.');
  const ambiguous = spec.via.filter(v=>v.mode === 'UNSPECIFIED');
  if (ambiguous.length) return pending(`Para ${ambiguous.map(v=>v.name).join(', ')}, ¿quieres pasar frente a la costa o hacer escala en puerto?`);
  if (spec.via.some(v=>v.mode === 'CALL')) return pending('He entendido que quieres hacer escala. El motor actual calcula tramos exteriores y no planifica accesos portuarios. ¿Quieres preparar solo el tramo exterior, sin tratar esa escala como un acceso calculado?');
  if (spec.unhandledConstraints.length) return pending(`He conservado estas condiciones, pero aún no puedo verificarlas: ${spec.unhandledConstraints.join('; ')}. No recalcularé eliminándolas. ¿Cómo quieres resolverlas?`,true);
  if (missing.length) return pending(`Faltan referencias geográficas verificadas para ${[...new Set(missing)].join(', ')}. No usaré coordenadas del modelo ni conservaré el destino anterior como si fuera el nuevo.`);
  if (spec.coastDistanceNm === null) return pending((targetPassages.length ? `He conservado el paso objetivo: ${targetPassages.map(v=>`${v.name}, banda ${band(v.distanceNm!)}`).join('; ')}. ` : '')+(interpretation.coastDistance.operation === 'INCREASE' ?
    '¿Desde qué separación a costa quieres aplicar ese incremento? La propuesta no tiene una distancia general definida.' :
    `He entendido ${summary(spec)}. ¿Qué separación general a costa quieres mantener para el tramo exterior?`));
  if (spec.coastDistanceNm > 10 || spec.via.length > 18) return pending('La petición supera los límites actuales del motor local: separación general de hasta 10 NM y hasta 20 referencias contando origen y destino. No he ampliado esos límites ni calculado una alternativa.');
  try {
    const generated = await services.generate(structuredClone(spec),resolved);
    const candidate = {...generated,specification:structuredClone(spec)};
    const analysis = await services.analyze(candidate);
    if (!candidate.offshore || !analysis.surfaces.declaredCoverageComplete || !analysis.clearanceCoverageComplete ||
        !analysis.coastResourcesLoaded || analysis.failedSectors.length ||
        analysis.surfaces.legs.some(l=>l.status !== 'NO_LAND_CONTACT_DETECTED') || analysis.clearance?.meetsRequestedDistance !== true || targetPassages.length > 0 &&
        (analysis.referencePassages?.length !== targetPassages.length || analysis.referencePassages.some(p=>p.status !== 'WITHIN_BAND'))) {
      return pending('El análisis no permite confirmar cobertura y separación geométrica para esta alternativa. Mantengo la propuesta anterior y no considero calculada la nueva.');
    }
    const distance = proposalDistanceNm(candidate);
    return {handled:true,state:{spec,pending:false},proposal:candidate,
      reply:`He preparado una propuesta exterior de ${spec.origin} a ${spec.destination}${spec.via.length ? `, pasando frente a ${spec.via.map(v=>v.name).join(', ')}` : ''}, con separación solicitada de ${spec.coastDistanceNm.toLocaleString('es-ES')} NM a costa. `+
        (distance === null ? '' : `Suma ${formatNm(distance)} NM, excluidos los accesos portuarios. `)+
        (analysis.referencePassages?.map(p=>`Paso frente a ${p.name}: mínimo geométrico ${formatNm(p.minimumDistanceNm!)} NM, objetivo ${p.targetDistanceNm.toLocaleString('es-ES')} ±${p.toleranceNm.toLocaleString('es-ES')} NM. `).join('') ?? '')+
        'Está visible y editable. Es experimental y no acredita seguridad; navegación y piloto siguen sin activar.'};
  } catch (error) {
    const detail=error instanceof Error && error.message.includes('ISLAND_BOUNDARY_UNAVAILABLE') ? 'Falta un contorno cerrado inequívoco vinculado al objeto geográfico de la isla. ' :
      error instanceof Error && error.message.includes('INCOMPLETE_CORRIDOR_COVERAGE') ? 'La cobertura detallada del corredor es incompleta. ' : '';
    return {...pending(detail+'Los lugares se han resuelto, pero no he podido calcular esta alternativa con la cobertura cartográfica y los límites actuales del planificador. Mantengo la propuesta anterior. Los accesos portuarios siguen sin planificar. '+provenance()),
      diagnostic:error instanceof Error ? error.message : 'PLANNING_FAILED'};
  }
}
