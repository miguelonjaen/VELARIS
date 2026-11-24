import type { FeatureCollection, LineString, MultiLineString } from 'geojson';
import type { CoastLine } from '../../../../core/navigation/CoastProximity';
import type { RouteSector } from '../../../../core/navigation/RouteCorridor';

type CoastalCollection = FeatureCollection<
    LineString | MultiLineString,
    { kind: string; osmId?: string; osmVersion?: number; sourceTimestamp?: string }
>;

function toCoastLine(positions: number[][]): CoastLine {
    if (
        positions.length < 2 ||
        positions.some(p =>
            p.length < 2 ||
            !Number.isFinite(p[0]) ||
            !Number.isFinite(p[1]) ||
            Math.abs(p[0]) > 180 ||
            Math.abs(p[1]) > 90
        )
    ) {
        throw new Error('Invalid coastline coordinates');
    }

    return positions.map(p => [p[0], p[1]] as [number, number]);
}
export interface RouteCoastBoundary {
    providerId: string;
    source: string;
    sourceTimestamp: string;
    version: number;
    line: CoastLine;
}
export interface RouteCoastData {
    boundaries: RouteCoastBoundary[];
    lines: CoastLine[];
    loadedSectors: string[];
    failedSectors: string[];
    complete: boolean;
}

const loaders = import.meta.glob<CoastalCollection>(
    './mediterranean/sector-*.json',
    { import: 'default' }
);

export async function loadRouteCoast(
    sectors: readonly RouteSector[]
): Promise<RouteCoastData> {
    const lines: CoastLine[] = [];
    const boundaries: RouteCoastBoundary[] = [];
    const loadedSectors: string[] = [];
    const failedSectors: string[] = [];

    for (const sector of sectors) {
        if (sector.simplified || sector.resources.length === 0) {
            failedSectors.push(sector.id);
            continue;
        }

        try {
            const parts = await Promise.all(
                sector.resources.map(filename => {
                    const loader = loaders[`./mediterranean/${filename}`];

                    if (!loader) {
                        throw new Error(`Missing coastline resource: ${filename}`);
                    }

                    return loader();
                })
            );

            const sectorLines: CoastLine[] = [];
            const sectorBoundaries: RouteCoastBoundary[] = [];

            for (const part of parts) {
                if (part.type !== 'FeatureCollection' || !Array.isArray(part.features)) {
                    throw new Error('Invalid coastline collection');
                }

                for (const feature of part.features) {
                    if (feature.properties?.kind !== 'coastline') continue;

                    if (feature.geometry.type === 'LineString') {
                        const line=toCoastLine(feature.geometry.coordinates);
                        sectorLines.push(line);
                        const props=feature.properties;
                        if(typeof props.osmId === 'string' && /^\d{1,16}$/.test(props.osmId) &&
                            String(feature.id).startsWith(`osm-way-${props.osmId}-`) && Number.isInteger(props.osmVersion) && props.osmVersion! > 0 &&
                            typeof props.sourceTimestamp === 'string' && Number.isFinite(Date.parse(props.sourceTimestamp)) && line.length >= 4 &&
                            line[0][0] === line[line.length-1][0] && line[0][1] === line[line.length-1][1]) {
                            sectorBoundaries.push({providerId:`osm:way/${props.osmId}`,source:`https://www.openstreetmap.org/way/${props.osmId}`,
                                sourceTimestamp:props.sourceTimestamp,version:props.osmVersion!,line});
                        }
                    } else if (feature.geometry.type === 'MultiLineString') {
                        sectorLines.push(...feature.geometry.coordinates.map(toCoastLine));
                    }
                }
            }

            if (sectorLines.length === 0) {
                failedSectors.push(sector.id);
                continue;
            }

            lines.push(...sectorLines);
            boundaries.push(...sectorBoundaries);
            loadedSectors.push(sector.id);
        } catch {
            failedSectors.push(sector.id);
        }
    }

    return {
        boundaries,
        lines,
        loadedSectors,
        failedSectors,
        // Means all requested resources loaded, NOT verified geographic coverage.
        complete: sectors.length > 0 && failedSectors.length === 0
    };
}
