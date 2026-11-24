/** La rosa está orientada al norte: todos sus trazos deben usar demoras absolutas. */
export function sailHudBearings(heading: number, direction?: number, relative?: number, waypoint?: number) {
    const valid = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value);
    const normal = (value: number) => ((value % 360) + 360) % 360;
    return {
        wind: valid(direction) ? normal(direction) : valid(relative) && Number.isFinite(heading) ? normal(heading + relative) : null,
        waypoint: valid(waypoint) ? normal(waypoint) : null
    };
}

/** A stored bearing alone is not evidence of an active navigation target. */
export function activeWaypointBearing(
    bearing: number | undefined,
    target: { lat: number; lng: number } | null | undefined,
    navigating: boolean
): number | undefined {
    if (!navigating || !target || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)
        || Math.abs(target.lat) > 90 || Math.abs(target.lng) > 180
        || typeof bearing !== 'number' || !Number.isFinite(bearing)) return undefined;
    return ((bearing % 360) + 360) % 360;
}
