import {TARGET_PASSAGE_TOLERANCE_NM, type RouteSpecification} from './routeIntent';
import { planOffshoreRoute, type OffshorePlan, type IslandPassageConstraint } from '../../core/navigation/RouteOffshorePlanner';
import type { InterpretedRoute } from './routeIntentClient';
import { resolveRoutePlace, type RoutePlace } from './routePlaces';
import { selectRouteCorridor, type RoutePosition, type RouteSector } from '../../core/navigation/RouteCorridor';
import { analyzeRouteCoastClearance, type RouteCoastClearance } from '../../core/navigation/RouteCoastClearance';
import { analyzeRouteSurfaces, boundsWithinCoverage, type RouteSurfaceAnalysis } from '../../core/navigation/RouteSurfaceAnalysis';
import { loadSurfaceSector, type SurfaceSector } from '../navigation/components/smartcharts/surface-contract';
import { loadRouteCoast, type RouteCoastData } from '../navigation/components/smartcharts/routeCoastLoader';
import catalog from '../navigation/components/smartcharts/mediterranean/catalog.json';

const resources = import.meta.glob<unknown>('../navigation/components/smartcharts/mediterranean/base/*.json', { import: 'default' });
const read = async (filename: string): Promise<unknown> => {
    const loader = resources[`../navigation/components/smartcharts/mediterranean/base/${filename}`];
    if (!loader) throw new Error(`Missing surface resource: ${filename}`);
    return loader();
};
export interface IslandPassageAnalysis {
    name: string;
    targetDistanceNm: number;
    toleranceNm: number;
    minimumDistanceNm: number | null;
    status: 'WITHIN_BAND' | 'OUTSIDE_BAND' | 'UNKNOWN';
    source?: string;
    sourceTimestamp?: string;
}
export interface RouteProposalAnalysis {
    referencePassages?: IslandPassageAnalysis[];
    surfaces: RouteSurfaceAnalysis;
    clearance: RouteCoastClearance | null;
    coastResourcesLoaded: boolean;
    clearanceCoverageComplete: boolean;
    failedSectors: string[];
}
export interface RouteProposal {
    id: string;
    places: RoutePlace[];
    positions: RoutePosition[];
    requestedDistanceNm: number | null;
    constraints: string[];
    specification?: RouteSpecification;
    offshore?: OffshorePlan;
    edited?: boolean;
    pointLabels?: string[];
    referenceIndices?: (number | null)[];
}
export function createRouteProposal(route: InterpretedRoute, resolvedPlaces?: RoutePlace[]): RouteProposal {
    const places = resolvedPlaces ? structuredClone(resolvedPlaces) : [route.origin, ...route.via, route.destination].map(resolveRoutePlace);
    if (places.length !== route.via.length+2 || places.some(p=>p.position.length !== 2 || !p.position.every(Number.isFinite) || Math.abs(p.position[0]) > 180 || Math.abs(p.position[1]) > 90)) throw new Error('INVALID_RESOLVED_REFERENCES');
    return { id: crypto.randomUUID(), places, positions: places.map(p => p.position), requestedDistanceNm: route.coastDistanceNm, constraints: [...route.constraints] };
}
interface BoundPassage extends IslandPassageConstraint {name:string; source:string; sourceTimestamp:string}
function bindIslandPassages(proposal: RouteProposal, coast: RouteCoastData): BoundPassage[] {
    return (proposal.specification?.via ?? []).flatMap((reference,index)=>{
        if(reference.distanceNm === null)return [];
        const place=proposal.places[index+1];
        if(reference.kind !== 'ISLAND' || reference.mode !== 'PASS' || place?.kind !== 'ISLAND' || place.datum !== 'WGS84' || !place.providerId)
            throw new Error(`SMARTCHARTS_ISLAND_BOUNDARY_UNAVAILABLE: ${reference.name}`);
        const matches=coast.boundaries.filter(boundary=>boundary.providerId === place.providerId);
        const unique=[...new Map(matches.map(boundary=>[JSON.stringify(boundary.line),boundary])).values()];
        if(unique.length !== 1)throw new Error(`SMARTCHARTS_ISLAND_BOUNDARY_UNAVAILABLE: ${reference.name}`);
        const boundary=unique[0];
        return [{referenceIndex:index+1,boundary:boundary.line,targetDistanceNm:reference.distanceNm,
            toleranceNm:TARGET_PASSAGE_TOLERANCE_NM,name:reference.name,source:boundary.source,sourceTimestamp:boundary.sourceTimestamp}];
    });
}
function analyzeIslandPassages(proposal:RouteProposal,coast:RouteCoastData):IslandPassageAnalysis[] {
    try {
        return bindIslandPassages(proposal,coast).map(p=>{
            const minimum=analyzeRouteCoastClearance(proposal.positions,[p.boundary],0).minimumDistanceMeters;
            const minimumDistanceNm=minimum === null ? null : minimum/1852;
            return {name:p.name,targetDistanceNm:p.targetDistanceNm,toleranceNm:p.toleranceNm,minimumDistanceNm,
                status:minimumDistanceNm === null ? 'UNKNOWN' : minimumDistanceNm >= p.targetDistanceNm-p.toleranceNm && minimumDistanceNm <= p.targetDistanceNm+p.toleranceNm ? 'WITHIN_BAND' : 'OUTSIDE_BAND',
                source:p.source,sourceTimestamp:p.sourceTimestamp};
        });
    } catch {
        return (proposal.specification?.via ?? []).filter(v=>v.distanceNm !== null).map(v=>({name:v.name,targetDistanceNm:v.distanceNm!,
            toleranceNm:TARGET_PASSAGE_TOLERANCE_NM,minimumDistanceNm:null,status:'UNKNOWN'}));
    }
}
async function loadProposalGeography(positions: readonly RoutePosition[], marginNm: number) {
    const sectors: RouteSector[] = catalog.sectors.map(s => ({ ...s, bbox: [s.bbox[0], s.bbox[1], s.bbox[2], s.bbox[3]] }));
    const selection = selectRouteCorridor(positions, sectors, Math.min(100, marginNm));
    const [coast, results] = await Promise.all([
        loadRouteCoast(selection.sectors),
        Promise.allSettled(selection.sectors.map(s => loadSurfaceSector(s.id, read)))
    ]);
    const loaded: SurfaceSector[] = [];
    const failedSectors: string[] = [...coast.failedSectors];
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') loaded.push(result.value);
        else failedSectors.push(selection.sectors[index].id);
    });
    return { loaded, coast, failedSectors: [...new Set(failedSectors)] };
}

export async function generateOffshoreProposal(proposal: RouteProposal, signal?: AbortSignal): Promise<RouteProposal> {
    if (proposal.requestedDistanceNm === null) throw new Error('Indique una separación a costa antes de calcular.');
    if (proposal.constraints.length) throw new Error('Las restricciones adicionales requieren revisión antes del cálculo exterior.');
    const references = proposal.places.map(place=>place.position);
    const { loaded, coast } = await loadProposalGeography(references, Math.max(12,proposal.requestedDistanceNm+8));
    const usableSectors = loaded.filter(s=>catalog.sectors.some(sector=>sector.id === s.id && !sector.simplified) && coast.loadedSectors.includes(s.id));
    const bounds = selectRouteCorridor(references,[],proposal.requestedDistanceNm+0.2).bounds;
    if (!boundsWithinCoverage(bounds,usableSectors.map(s=>s.coverage))) throw new Error('SMARTCHARTS_INCOMPLETE_CORRIDOR_COVERAGE');
    const islandPassages=bindIslandPassages(proposal,coast);
    const offshore = await planOffshoreRoute(references, coast.lines, usableSectors, proposal.requestedDistanceNm, {signal,islandPassages});
    const referenceIndices = offshore.positions.map((_,index) => {
        const anchor = offshore.anchorIndices.indexOf(index);
        return anchor < 0 ? null : anchor;
    });
    const pointLabels = referenceIndices.map((reference,index) => reference === null ? `Tránsito exterior ${index+1}` : `Frente a ${proposal.places[reference].name}`);
    return { ...proposal, id:crypto.randomUUID(), positions:offshore.positions, offshore, edited:false, pointLabels, referenceIndices };
}

export async function analyzeRouteProposal(proposal: RouteProposal): Promise<RouteProposalAnalysis> {
    const margin = proposal.requestedDistanceNm === null ? 0 : proposal.requestedDistanceNm+0.2;
    const { loaded, coast, failedSectors } = await loadProposalGeography([...proposal.positions,...proposal.places.map(p=>p.position)], Math.max(5,margin));
    const surfaces = analyzeRouteSurfaces(proposal.positions, loaded);
    // Require the entire clearance search rectangle in loaded extents. Loading
    // selected resources alone never establishes coverage around the route.
    const bounds = selectRouteCorridor(proposal.positions, [], margin).bounds;
    const rectangles = loaded.filter(s => coast.loadedSectors.includes(s.id)).map(s => s.coverage);
    const clearanceCoverageComplete = boundsWithinCoverage(bounds, rectangles);
    return {
        referencePassages:analyzeIslandPassages(proposal,coast),
        surfaces,
        clearance: proposal.requestedDistanceNm === null ? null : analyzeRouteCoastClearance(
            proposal.positions, coast.lines, proposal.requestedDistanceNm
        ),
        coastResourcesLoaded: coast.complete,
        clearanceCoverageComplete,
        failedSectors: [...new Set(failedSectors)]
    };
}
