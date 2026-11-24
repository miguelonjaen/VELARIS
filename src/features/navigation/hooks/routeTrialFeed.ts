import type { ResolvedNavigationState } from '../../../core/navigation/SharedNavigationState';
export type TrialNmeaSource = 'BOAT' | 'SIMULATOR';
export function trialStartFeed(nav: ResolvedNavigationState) {
  const position = nav.position, sog = nav.sog;
  if(position.status!=='VALID' || !position.value || (position.source!=='BOAT' && position.source!=='SIMULATOR'))
    return {ready:false,reason:'Falta posición NMEA vigente. Conecte el simulador; el GPS Droid no inicia ensayos.'} as const;
  if(sog.status!=='VALID' || sog.value===null || !Number.isFinite(sog.value) || sog.value<0 || sog.value>200 || (sog.source!=='BOAT' && sog.source!=='SIMULATOR'))
    return {ready:false,reason:'Falta SOG NMEA vigente. Active el envío de velocidad en el simulador.'} as const;
  if(sog.source!==position.source)
    return {ready:false,reason:'Posición y SOG proceden de fuentes distintas. Configure ambas desde el mismo origen NMEA.'} as const;
  return {ready:true,position:position.value,sog:sog.value,source:sog.source} as const;
}
/** A running trial never silently switches from simulator to live boat telemetry or vice versa. */
export function trialSog(nav:ResolvedNavigationState,source:TrialNmeaSource|null):number|null {
  const sog=nav.sog;
  return source!==null && sog.status==='VALID' && sog.source===source && sog.value!==null && Number.isFinite(sog.value) && sog.value>=0 && sog.value<=200 ? sog.value : null;
}

/** True heading only: magnetic HDG/HDM and GPS COG are not interchangeable. */
export function trialHeading(nav: ResolvedNavigationState, source: TrialNmeaSource | null): number | null {
  const heading = nav.headingTrue;
  return source !== null && heading.status === 'VALID' && heading.source === source
    && heading.sourceId === nav.sog.sourceId && heading.value !== null && Number.isFinite(heading.value)
    && heading.value >= 0 && heading.value <= 360 ? heading.value % 360 : null;
}
