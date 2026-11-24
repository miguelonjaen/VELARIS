import {resolveGeographicPlace} from './geographicClient';
import {handleRouteConversation,type RouteConversationState} from './routeConversation';
import {requestRouteConversation} from './routeIntentClient';
import {createRouteProposal,generateOffshoreProposal,analyzeRouteProposal,type RouteProposal} from './routeProposal';

/** Production adapter, shared by Electron and end-to-end tests. No navigation effects. */
export function handleTacticalConversation(
  order:string,state:RouteConversationState,current:RouteProposal|null,
  endpoint?:string
) {
  return handleRouteConversation(order,state,current,{
    interpret:(text,context)=>requestRouteConversation(text,context,endpoint),
    supportsIslandPassages:true,
    resolve:(name,kind)=>resolveGeographicPlace(name,kind,endpoint ? endpoint.replace(/\/api\/route-intent$/,'/api/geographic-resolve') : undefined),
    generate:(spec,places)=>generateOffshoreProposal({...createRouteProposal({
      origin:spec.origin,destination:spec.destination,via:spec.via.map(v=>v.name),
      coastDistanceNm:spec.coastDistanceNm,constraints:[...spec.unhandledConstraints]
    },places),specification:spec}),
    analyze:analyzeRouteProposal
  });
}
