import { parseRouteInterpretation, type RouteInterpretationContext, type RouteInterpretation } from './routeIntent';
﻿export interface InterpretedRoute {
  origin: string | null;
  destination: string | null;
  via: string[];
  coastDistanceNm: number | null;
  constraints: string[];
}

export interface RouteIntentResponse {
  status: 'INTERPRETED';
  requiresGeographicResolution: true;
  route: InterpretedRoute;
}

const API_BASE_URL = (
  import.meta.env.VITE_LOCAL_API_URL ||
  'http://127.0.0.1:8089'
).replace(/\/$/, '');

export async function requestRouteInterpretation(
  order: string
): Promise<RouteIntentResponse> {
  const response = await fetch(`${API_BASE_URL}/api/route-intent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ order }),
    signal: AbortSignal.timeout(50000)
  });

  if (!response.ok) {
    throw new Error(`ROUTE_INTERPRETATION_HTTP_${response.status}`);
  }

  const result: unknown = await response.json();

  if (
    !result ||
    typeof result !== 'object' ||
    !('status' in result) ||
    result.status !== 'INTERPRETED' ||
    !('requiresGeographicResolution' in result) ||
    result.requiresGeographicResolution !== true ||
    !('route' in result) ||
    !result.route ||
    typeof result.route !== 'object'
  ) {
    throw new Error('ROUTE_INTERPRETATION_INVALID_RESPONSE');
  }

  const route = result.route as Record<string, unknown>;

  const validPlace = (value: unknown) =>
    value === null ||
    (typeof value === 'string' && value.length <= 200);

  if (
    !validPlace(route.origin) ||
    !validPlace(route.destination) ||
    !Array.isArray(route.via) ||
    route.via.length > 50 ||
    !route.via.every(
      value => typeof value === 'string' && value.length <= 200
    ) ||
    !Array.isArray(route.constraints) ||
    route.constraints.length > 30 ||
    !route.constraints.every(
      value => typeof value === 'string' && value.length <= 500
    ) ||
    (
      route.coastDistanceNm !== null &&
      (
        typeof route.coastDistanceNm !== 'number' ||
        !Number.isFinite(route.coastDistanceNm) ||
        route.coastDistanceNm <= 0 ||
        route.coastDistanceNm > 100
      )
    )
  ) {
    throw new Error('ROUTE_INTERPRETATION_INVALID_DATA');
  }

  return result as RouteIntentResponse;
}

/** All tactical input is semantically classified before the general assistant can run. */
export async function requestRouteConversation(
  order: string, context: RouteInterpretationContext,
  endpoint = `${API_BASE_URL}/api/route-intent`
): Promise<RouteInterpretation> {
  const response = await fetch(endpoint,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({order,context,contractVersion:2}),signal:AbortSignal.timeout(95000)
  });
  if (!response.ok) throw new Error(`ROUTE_CONVERSATION_HTTP_${response.status}`);
  const data:unknown = await response.json();
  if (!data || typeof data !== 'object' || !('contractVersion' in data) || data.contractVersion !== 2 ||
      !('status' in data) || data.status !== 'INTERPRETED' || !('interpretation' in data)) {
    throw new Error('ROUTE_CONVERSATION_INVALID_ENVELOPE');
  }
  return parseRouteInterpretation(data.interpretation);
}
