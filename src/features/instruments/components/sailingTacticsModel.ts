import { currentValue } from '../../boat/boatVisualModel';
import { NavigationEngine } from '../../../core/navigation/NavigationEngine';
import type { BoatPanelInput } from '../../boat/boatPanelModel';
import type { BoatPolar } from '../../../core/navigation/BoatPolar';
import { evaluatePolarLaylines, polarLaylineRays, polarSpeed } from '../../../core/navigation/BoatPolar';
import { resolveWind } from '../../../core/instruments/resolveWind';
import { GeoMath } from '../../../core/navigation/GeoMath';
import type { GeoPoint } from '../../../core/navigation/GeoPoint';
export interface SailingTacticsInput {
  readonly boat: BoatPanelInput;
  readonly polar: BoatPolar | null;
  readonly waypoint: { readonly position: GeoPoint; readonly name: string } | null;
}
export const relativeBearing = (bearing:number, heading:number):number => ((bearing-heading+540)%360+360)%360-180;
const navigationEngine = new NavigationEngine();
const number = (field:{readonly status:string;readonly value:number|null}):number|null => field.status==='VALID' && field.value!==null && Number.isFinite(field.value) ? field.value : null;
const point = (value:GeoPoint|null):GeoPoint|null => value && Number.isFinite(value.lat) && Number.isFinite(value.lng) && Math.abs(value.lat)<=90 && Math.abs(value.lng)<=180 ? value : null;
/** Reuses the navigation geometry, wind resolver and saved polar. No SOG→STW substitution. */
export function buildSailingTacticsModel(input:SailingTacticsInput) {
  const {boat}=input, nav=boat.navigation;
  const wind=resolveWind(boat.instruments,nav,null,boat.now);
  const headingTrue=number(nav.headingTrue), headingMagnetic=number(nav.headingMagnetic);
  const heading=headingTrue ?? headingMagnetic;
  const reference=headingTrue!==null?'T':headingMagnetic!==null?'M':null;
  const position=nav.position.status==='VALID'?point(nav.position.value):null;
  const waypoint=point(input.waypoint?.position ?? null);
  const sog=number(nav.sog), cog=number(nav.cog);
  const distance=position && waypoint ? GeoMath.distanceNM(position,waypoint) : null;
  const bearing=position && waypoint && distance!==null && distance>0.005 ? GeoMath.initialBearing(position,waypoint) : null;
  const vmg=sog!==null && sog>=0 && cog!==null && bearing!==null ? navigationEngine.calculateVMG(sog,cog,bearing) : null;
  const seconds=distance!==null && vmg!==null && vmg>0.2 ? navigationEngine.calculateETA(distance,vmg) : null;
  const availability=evaluatePolarLaylines({polar:input.polar,positionAvailable:position!==null,waypointAvailable:waypoint!==null,windSource:wind.source,tws:wind.tws,twd:wind.twd});
  const rays=polarLaylineRays(position,waypoint,wind.twd,availability.targets);
  const port=rays && position ? GeoMath.initialBearing(position,{lat:rays.boatPortPath[1][0],lng:rays.boatPortPath[1][1]}) : null;
  const starboard=rays && position ? GeoMath.initialBearing(position,{lat:rays.boatStbdPath[1][0],lng:rays.boatStbdPath[1][1]}) : null;
  const targetSpeed=wind.source==='BOAT' && wind.tws!==null && wind.twa!==null ? polarSpeed(input.polar,wind.tws,wind.twa) : null;
  const stw=currentValue(boat.instruments.speedThroughWater ?? null,8000);
  const performancePercent=stw!==null && targetSpeed!==null && targetSpeed>0 ? stw/targetSpeed*100 : null;
  return {
    wind,heading,reference,headingTrue,sog,cog,stw,performancePercent,
    distance,bearing,vmg,seconds,targetSpeed,
    waypointName:waypoint?input.waypoint?.name ?? 'Waypoint activo':'Sin waypoint',
    depth:boat.instruments.depth?.value.meters ?? null,
    depthReference:boat.instruments.depth?.value.reference ?? null,
    waypointRelative:headingTrue!==null && bearing!==null ? relativeBearing(bearing,headingTrue):null,
    portRelative:headingTrue!==null && port!==null ? relativeBearing(port,headingTrue):null,
    starboardRelative:headingTrue!==null && starboard!==null ? relativeBearing(starboard,headingTrue):null,
    laylineReason:rays ? `${availability.reason} · Aproximación sin corriente ni abatimiento` : availability.targets ? 'Sin geometría de laylines utilizable' : availability.reason,
    simulated:boat.voyage.isTrial===true || [nav.position,nav.sog,nav.cog,nav.headingTrue,nav.headingMagnetic].some(field=>field.status==='VALID' && field.source==='SIMULATOR'),
    headingSource:headingTrue!==null?nav.headingTrue.source:headingMagnetic!==null?nav.headingMagnetic.source:null,
    sogSource:sog!==null?nav.sog.source:null,
  } as const;
}
export type SailingTacticsModel=ReturnType<typeof buildSailingTacticsModel>;
