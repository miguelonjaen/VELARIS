import type { Feature, Geometry } from 'geojson';
export interface NauticalProperties { kind:string; name:string; osmType:string; osmId:string; tags:Record<string,string>; sourceTimestamp:string|null }
export type NauticalFeature=Feature<Geometry,NauticalProperties>;
const colours:Record<string,number>={white:1,black:2,red:3,green:4,blue:5,yellow:6,grey:7,brown:8,amber:9,violet:10,orange:11,magenta:12,pink:13};
const buoyShapes:Record<string,number>={conical:1,can:2,spherical:3,pillar:4,spar:5,barrel:6,super_buoy:7,ice_buoy:8};
const beaconShapes:Record<string,number>={stake:1,withy:2,tower:3,lattice:4,pile:5,cairn:6,buoyant:7};
/** Display adapter only. OSM tags stay intact; this does not create or certify an ENC. */
export function nauticalPortrayal(feature:NauticalFeature):Feature<Geometry,Record<string,unknown>> {
 const {kind,tags}=feature.properties;
 const layer=kind.startsWith('buoy_')?'BOYSPP':kind.startsWith('beacon_')?'BCNSPP':kind.startsWith('light_')||kind==='lighthouse'?'LIGHTS':kind==='wreck'?'WRECKS':kind==='rock'?'UWTROC':kind==='obstruction'?'OBSTRN':'UNKNOWN';
 const color=tags[`seamark:${kind}:colour`]??(layer==='LIGHTS'?tags['seamark:light:colour']:undefined);
 const pattern:Record<string,number>={horizontal:1,vertical:2,diagonal:3,squared:4,border:6};
 return {...feature,properties:{__s57Layer:layer,COLOUR:color?.split(';').map(c=>colours[c]).filter((c):c is number=>c!==undefined),BOYSHP:buoyShapes[tags[`seamark:${kind}:shape`]],BCNSHP:beaconShapes[tags[`seamark:${kind}:shape`]],COLPAT:pattern[tags[`seamark:${kind}:colour_pattern`]]}};
}
