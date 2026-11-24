import type { CoastLine } from './CoastProximity';
import type { RouteBounds, RoutePosition } from './RouteCorridor';
import { analyzeRouteCoastClearance } from './RouteCoastClearance';
import { analyzeRouteSurfaces, boundsWithinCoverage } from './RouteSurfaceAnalysis';
import { containsSurface, type SurfaceSector } from '../../features/navigation/components/smartcharts/surface-contract';

const NM = 1852;
const SCALE = 6371000 * Math.PI / 180;
type XY = readonly [number, number];
type Segment = readonly [XY, XY];
export interface OffshorePlan {
    positions: RoutePosition[];
    /** Route waypoint corresponding to each reference, in original order. */
    anchorIndices: number[];
    requestedDistanceNm: number;
    constructionMarginNm: number;
    gridStepNm: number;
    examinedNodes: number;
    navigationUse: false;
    portAccess: 'NOT_PLANNED';
}
export interface IslandPassageConstraint {
    referenceIndex: number;
    boundary: CoastLine;
    targetDistanceNm: number;
    toleranceNm: number;
}
export interface OffshorePlannerOptions {
    islandPassages?: readonly IslandPassageConstraint[];
    signal?: AbortSignal;
    gridStepNm?: number;
    maxNodes?: number;
    yieldControl?: () => Promise<void>;
}

function pointSegmentDistance(p: XY, a: XY, b: XY): number {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const length2 = dx * dx + dy * dy;
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function cross(a: XY, b: XY, c: XY): number {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function segmentDistance(a: XY, b: XY, c: XY, d: XY): number {
    const o1 = cross(a,b,c), o2 = cross(a,b,d), o3 = cross(c,d,a), o4 = cross(c,d,b);
    if (o1 * o2 < 0 && o3 * o4 < 0) return 0;
    return Math.min(pointSegmentDistance(a,c,d), pointSegmentDistance(b,c,d),
        pointSegmentDistance(c,a,b), pointSegmentDistance(d,a,b));
}

interface HeapEntry { id: number; score: number; cost: number }
class MinHeap {
    private items: HeapEntry[] = [];
    push(entry: HeapEntry): void {
        let i = this.items.length;
        this.items.push(entry);
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.items[parent].score <= entry.score) break;
            this.items[i] = this.items[parent]; i = parent;
        }
        this.items[i] = entry;
    }
    pop(): HeapEntry | undefined {
        const top = this.items[0], last = this.items.pop();
        if (!last || this.items.length === 0) return top;
        let i = 0;
        while (i * 2 + 1 < this.items.length) {
            let child = i * 2 + 1;
            if (child + 1 < this.items.length && this.items[child + 1].score < this.items[child].score) child++;
            if (this.items[child].score >= last.score) break;
            this.items[i] = this.items[child]; i = child;
        }
        this.items[i] = last;
        return top;
    }
}

/** Experimental local grid search. Never plans port approaches or activates navigation.
 * A finite grid can fail to find an existing passage: failure is NOT proof of impossibility.
 */
export async function planOffshoreRoute(
    references: readonly RoutePosition[], coast: readonly CoastLine[],
    sectors: readonly SurfaceSector[], requestedDistanceNm: number,
    options: OffshorePlannerOptions = {}
): Promise<OffshorePlan> {
    let stepNm = options.gridStepNm ?? 0.5;
    const maxNodes = options.maxNodes ?? 16000;
    if (references.length < 2 || references.length > 20 || references.some(p =>
        p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 70
    ) || !Number.isFinite(requestedDistanceNm) || requestedDistanceNm <= 0 || requestedDistanceNm > 10 ||
        !Number.isFinite(stepNm) || stepNm < 0.1 || stepNm > 2 ||
        !Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 50000) {
        throw new Error('OFFSHORE_INVALID_OR_UNSUPPORTED_INPUT');
    }
    const passages = options.islandPassages ?? [];
    if (passages.length > 18 || new Set(passages.map(p=>p.referenceIndex)).size !== passages.length || passages.some(p=>
        !Number.isInteger(p.referenceIndex) || p.referenceIndex < 1 || p.referenceIndex >= references.length-1 ||
        !Number.isFinite(p.targetDistanceNm) || p.targetDistanceNm <= 0 || p.targetDistanceNm > 10 ||
        !Number.isFinite(p.toleranceNm) || p.toleranceNm <= 0 || p.toleranceNm >= p.targetDistanceNm ||
        p.boundary.length < 4 || p.boundary.length > 10000 || p.boundary.some(q=>q.length !== 2 || !q.every(Number.isFinite) || Math.abs(q[0]) > 180 || Math.abs(q[1]) > 70) ||
        p.boundary[0][0] !== p.boundary[p.boundary.length-1][0] || p.boundary[0][1] !== p.boundary[p.boundary.length-1][1]
    )) throw new Error('OFFSHORE_INVALID_ISLAND_PASSAGE');
    if (passages.some(p=>requestedDistanceNm > p.targetDistanceNm+p.toleranceNm)) throw new Error('OFFSHORE_PASSAGE_CONFLICT');
    const lngs = references.map(p => p[0]), lats = references.map(p => p[1]);
    if (Math.max(...lngs) - Math.min(...lngs) > 3 || Math.max(...lats) - Math.min(...lats) > 2) {
        throw new Error('OFFSHORE_UNSUPPORTED_ROUTE_EXTENT');
    }
    const center: RoutePosition = [(Math.max(...lngs)+Math.min(...lngs))/2, (Math.max(...lats)+Math.min(...lats))/2];
    const longitudeScale = SCALE * Math.cos(center[1] * Math.PI / 180);
    const project = (p: RoutePosition): XY => [(p[0]-center[0])*longitudeScale, (p[1]-center[1])*SCALE];
    const unproject = (p: XY): RoutePosition => [p[0]/longitudeScale+center[0], p[1]/SCALE+center[1]];
    const segments: Segment[] = [];
    for (const line of coast) {
        for (let i = 1; i < line.length; i++) {
            const a = line[i-1], b = line[i];
            if (![...a,...b].every(Number.isFinite) || Math.abs(a[0]) > 180 || Math.abs(b[0]) > 180 ||
                Math.abs(a[1]) > 80 || Math.abs(b[1]) > 80) throw new Error('OFFSHORE_INVALID_COAST');
            segments.push([project(a), project(b)]);
        }
    }
    if (!segments.length || !sectors.length) throw new Error('OFFSHORE_MISSING_GEOGRAPHY');
    const marginNm = passages.length ? Math.min(0.2,...passages.map(p=>Math.min(p.toleranceNm/4,
        Math.max(0,(p.targetDistanceNm+p.toleranceNm-Math.max(requestedDistanceNm,p.targetDistanceNm-p.toleranceNm))/4)))) : 0.2; // Numerical construction allowance; NOT a hydrographic safety margin.
    const radius = (requestedDistanceNm + marginNm) * NM;
    const localLimits = passages.map(p=>({passage:p,threshold:(p.targetDistanceNm-p.toleranceNm+marginNm)*NM,
        segments:p.boundary.slice(1).map((q,i):Segment=>[project(p.boundary[i]),project(q)])}));
    const extents = sectors.map(s => s.coverage);
    const searchMargin = Math.max(12, requestedDistanceNm + 8) * NM;
    const anchors = references.map(project);
    const xmin = Math.min(...anchors.map(p=>p[0])) - searchMargin;
    const ymin = Math.min(...anchors.map(p=>p[1])) - searchMargin;
    const xmax = Math.max(...anchors.map(p=>p[0])) + searchMargin;
    const ymax = Math.max(...anchors.map(p=>p[1])) + searchMargin;
    const dimensions = (spacingNm: number) => {
        const step=spacingNm*NM;
        const width=Math.ceil((xmax-xmin)/step)+1,height=Math.ceil((ymax-ymin)/step)+1;
        return {step,width,height,count:width*height};
    };
    let mesh=dimensions(stepNm);
    // Keep the existing memory/node budget. Only the automatic outer mesh may
    // coarsen; explicit spacing, exact coastline and local target bands stay fixed.
    if(options.gridStepNm === undefined){
        while(mesh.count+passages.length > maxNodes && stepNm < 2){
            stepNm=Number((stepNm+0.05).toFixed(2));mesh=dimensions(stepNm);
        }
    }
    const {step,width,height,count}=mesh;
    if (count+passages.length > maxNodes) throw new Error('OFFSHORE_SEARCH_BUDGET_EXCEEDED');
    const virtualPoints: XY[] = [];
    const connections = new Map<number, number[]>();
    const node = (id: number): XY => id >= count ? virtualPoints[id-count] : [xmin+(id%width)*step, ymin+Math.floor(id/width)*step];
    const validity = new Uint8Array(count+passages.length); // 0 unknown, 1 excluded, 2 accepted.
    let examinedNodes = 0;
    const yieldControl = options.yieldControl ?? (() => new Promise<void>(resolve => setTimeout(resolve,0)));
    const checkpoint = async (): Promise<void> => {
        if (options.signal?.aborted) throw new Error('OFFSHORE_CANCELLED');
        await yieldControl();
        if (options.signal?.aborted) throw new Error('OFFSHORE_CANCELLED');
    };
    const covered = (a: XY, b: XY): boolean => {
        const low = unproject([Math.min(a[0],b[0])-radius, Math.min(a[1],b[1])-radius]);
        const high = unproject([Math.max(a[0],b[0])+radius, Math.max(a[1],b[1])+radius]);
        const bounds: RouteBounds = [low[0],low[1],high[0],high[1]];
        return boundsWithinCoverage(bounds,extents);
    };
    const clear = (a: XY, b: XY): boolean => {
        const minx = Math.min(a[0],b[0])-radius, maxx = Math.max(a[0],b[0])+radius;
        const miny = Math.min(a[1],b[1])-radius, maxy = Math.max(a[1],b[1])+radius;
        for (const [c,d] of segments) {
            if (Math.max(c[0],d[0]) < minx || Math.min(c[0],d[0]) > maxx ||
                Math.max(c[1],d[1]) < miny || Math.min(c[1],d[1]) > maxy) continue;
            if (segmentDistance(a,b,c,d) < radius) return false;
        }
        for (const limit of localLimits) {
            if (limit.segments.some(([c,d])=>segmentDistance(a,b,c,d) < limit.threshold)) return false;
        }
        return true;
    };
    const seaPoint = (xy: XY): boolean => {
        const position = unproject(xy);
        return covered(xy,xy) && clear(xy,xy) && sectors.some(s=>containsSurface(s.layers.sea,[position[0],position[1]]));
    };
    const valid = (id: number): boolean => {
        if (validity[id]) return validity[id] === 2;
        examinedNodes++;
        const accepted = seaPoint(node(id));
        validity[id] = accepted ? 2 : 1;
        return accepted;
    };
    await checkpoint();
    const snapped: number[] = [];
    for (const [referenceIndex, reference] of anchors.entries()) {
        const local = localLimits.find(l=>l.passage.referenceIndex === referenceIndex);
        if (local) {
            // Fine local candidates avoid refining the whole offshore mesh. Each new
            // node and every connecting segment receive the same geometric checks.
            const {passage} = local;
            const low = Math.max(requestedDistanceNm,passage.targetDistanceNm-passage.toleranceNm)+marginNm;
            const high = passage.targetDistanceNm+passage.toleranceNm-marginNm;
            const sampleRadius = (low+high)/2*NM;
            const candidates: {xy:XY;score:number}[] = [];
            const stride = Math.max(1,Math.ceil((passage.boundary.length-1)/32));
            for (let i=0;i<passage.boundary.length-1;i+=stride) {
                await checkpoint();
                const base = project(passage.boundary[i]);
                for (let direction=0;direction<16;direction++) {
                    const angle=direction*Math.PI/8;
                    const xy:XY=[base[0]+sampleRadius*Math.cos(angle),base[1]+sampleRadius*Math.sin(angle)];
                    const distance=Math.min(...local.segments.map(([a,b])=>pointSegmentDistance(xy,a,b)))/NM;
                    if (distance < low || distance > high || !seaPoint(xy)) continue;
                    const before=anchors[referenceIndex-1],after=anchors[referenceIndex+1];
                    candidates.push({xy,score:Math.hypot(xy[0]-before[0],xy[1]-before[1])+Math.hypot(xy[0]-after[0],xy[1]-after[1])});
                }
            }
            candidates.sort((a,b)=>a.score-b.score);
            let selected: number | undefined;
            for (const candidate of candidates.slice(0,64)) {
                await checkpoint();
                const nearby=Array.from({length:count},(_,id)=>({id,distance:Math.hypot(node(id)[0]-candidate.xy[0],node(id)[1]-candidate.xy[1])}))
                    .filter(n=>n.distance <= Math.max(2,stepNm*3)*NM).sort((a,b)=>a.distance-b.distance || a.id-b.id);
                const adjacent:number[]=[];
                for(const neighbor of nearby){
                    if(valid(neighbor.id) && clear(candidate.xy,node(neighbor.id)) && covered(candidate.xy,node(neighbor.id))) adjacent.push(neighbor.id);
                    if(adjacent.length===8)break;
                }
                if(!adjacent.length)continue;
                selected=count+virtualPoints.length;virtualPoints.push(candidate.xy);validity[selected]=2;
                connections.set(selected,adjacent);
                for(const neighbor of adjacent)connections.set(neighbor,[...(connections.get(neighbor)??[]),selected]);
                break;
            }
            if(selected === undefined)throw new Error('OFFSHORE_NO_TARGET_PASSAGE_WITHIN_BAND');
            snapped.push(selected);continue;
        }
        const nearest = Array.from({length:count}, (_,id) => ({id, distance:Math.hypot(node(id)[0]-reference[0],node(id)[1]-reference[1])}))
            .filter(n=>n.distance <= searchMargin).sort((a,b)=>a.distance-b.distance || a.id-b.id);
        let found: number | undefined;
        for (let i = 0; i < nearest.length; i++) {
            if (i % 64 === 0) await checkpoint();
            if (valid(nearest[i].id)) { found = nearest[i].id; break; }
        }
        if (found === undefined) throw new Error('OFFSHORE_NO_ANCHOR_WITHIN_SEARCH_AREA');
        snapped.push(found);
    }
    const all: number[] = [], anchorIndices: number[] = [];
    for (let leg = 1; leg < snapped.length; leg++) {
        const start = snapped[leg-1], target = snapped[leg];
        const costs = new Float64Array(count+virtualPoints.length).fill(Infinity);
        const parents = new Int32Array(count+virtualPoints.length).fill(-1);
        const targetXY = node(target);
        const heap = new MinHeap();
        const heuristic = (id: number): number => Math.hypot(node(id)[0]-targetXY[0], node(id)[1]-targetXY[1]);
        costs[start] = 0; heap.push({id:start,cost:0,score:heuristic(start)});
        let reached = false, iterations = 0;
        for (let current = heap.pop(); current; current = heap.pop()) {
            if (++iterations % 64 === 0) await checkpoint();
            if (current.cost !== costs[current.id]) continue;
            if (current.id === target) { reached = true; break; }
            const neighbors=[...(connections.get(current.id) ?? [])];
            if(current.id < count){
                const x=current.id%width,y=Math.floor(current.id/width);
                for(const [dx,dy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]){
                    if(x+dx>=0 && x+dx<width && y+dy>=0 && y+dy<height)neighbors.push(current.id+dy*width+dx);
                }
            }
            for (const next of neighbors) {
                if(next>=count && next!==start && next!==target)continue;
                const a=node(current.id),b=node(next);
                const cost = current.cost+Math.hypot(a[0]-b[0],a[1]-b[1]);
                if (cost >= costs[next] || !valid(next) || !clear(node(current.id),node(next)) || !covered(node(current.id),node(next))) continue;
                costs[next] = cost; parents[next] = current.id;
                heap.push({id:next,cost,score:cost+heuristic(next)});
            }
        }
        if (!reached) throw new Error('OFFSHORE_NO_PATH_WITHIN_SEARCH_AREA');
        const path: number[] = [target];
        while (path[path.length-1] !== start) path.push(parents[path[path.length-1]]);
        path.reverse();
        // Simplify within each leg, preserving every mandatory offshore anchor.
        const simplified = [path[0]];
        for (let i = 0; i < path.length-1;) {
            await checkpoint();
            let next = i+1;
            for (let j = path.length-1; j > i+1; j--) {
                if (clear(node(path[i]),node(path[j])) && covered(node(path[i]),node(path[j]))) { next = j; break; }
            }
            simplified.push(path[next]); i = next;
        }
        if (!all.length) { all.push(simplified[0]); anchorIndices.push(0); }
        all.push(...simplified.slice(1));
        anchorIndices.push(all.length-1);
    }
    const positions = all.map(id=>unproject(node(id)));
    if (positions.length < 2) throw new Error('OFFSHORE_COINCIDENT_ANCHORS');
    await checkpoint();
    const surfaces = analyzeRouteSurfaces(positions,sectors);
    const clearance = analyzeRouteCoastClearance(positions,coast,requestedDistanceNm);
    if (!surfaces.declaredCoverageComplete || surfaces.legs.some(l=>l.status !== 'NO_LAND_CONTACT_DETECTED') ||
        clearance.meetsRequestedDistance !== true) throw new Error('OFFSHORE_FINAL_GEOMETRY_REJECTED');
    for(const passage of passages){
        const minimum=analyzeRouteCoastClearance(positions,[passage.boundary],0).minimumDistanceMeters;
        if(minimum === null || minimum/NM < passage.targetDistanceNm-passage.toleranceNm || minimum/NM > passage.targetDistanceNm+passage.toleranceNm) throw new Error('OFFSHORE_FINAL_PASSAGE_REJECTED');
    }
    return { positions, anchorIndices, requestedDistanceNm, constructionMarginNm:marginNm, gridStepNm:stepNm,
        examinedNodes, navigationUse:false, portAccess:'NOT_PLANNED' };
}
