import { NavigationEngine } from '../navigation/NavigationEngine';
import type { ResolvedNavigationState } from '../navigation/SharedNavigationState';
import type { MissionPlan } from './missionPlan';
const engine = new NavigationEngine();
export function voyageGuidance(plan: MissionPlan | undefined, index: number, nav: ResolvedNavigationState) {
  const waypoint = plan?.waypoints[index];
  const position = nav.position.status === 'VALID' && nav.position.source !== 'SIMULATOR' ? nav.position.value : null;
  if (!waypoint || !position) return null;
  const dtw = engine.calculateDistance(position, waypoint);
  const bearing = engine.calculateBearing(position, waypoint);
  const previous = plan?.waypoints[index - 1];
  const xte = previous ? engine.calculateXTE(position, previous, waypoint).signedDistanceNm : null;
  const sog = nav.sog.status === 'VALID' && nav.sog.source !== 'SIMULATOR' ? nav.sog.value : null;
  const etaSeconds = sog !== null ? engine.calculateETA(dtw, sog) : null;
  return { waypoint: waypoint.name || `WP ${index + 1}`, dtw, bearing, xte, etaSeconds };
}
