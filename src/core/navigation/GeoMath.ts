import { GeoPoint } from "./GeoPoint";

export class GeoMath {

    private static readonly EARTH_RADIUS_METERS = 6371000;

    private static readonly METERS_PER_NAUTICAL_MILE = 1852;

    private static toRadians(value: number): number {
    return value * Math.PI / 180;
}

private static toDegrees(value: number): number {
    return value * 180 / Math.PI;
}
public static distanceMeters(
    from: GeoPoint,
    to: GeoPoint
): number {

    const lat1 = this.toRadians(from.lat);
    const lat2 = this.toRadians(to.lat);

    const dLat = this.toRadians(to.lat - from.lat);
    const dLng = this.toRadians(to.lng - from.lng);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c =
        2 * Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return this.EARTH_RADIUS_METERS * c;

}
public static distanceNM(
    from: GeoPoint,
    to: GeoPoint
): number {

    return (
        this.distanceMeters(from, to) /
        this.METERS_PER_NAUTICAL_MILE
    );

}
public static initialBearing(
    from: GeoPoint,
    to: GeoPoint
): number {

    const lat1 = this.toRadians(from.lat);
    const lat2 = this.toRadians(to.lat);

    const dLng = this.toRadians(
        to.lng - from.lng
    );

    const y =
        Math.sin(dLng) * Math.cos(lat2);

    const x =
        Math.cos(lat1) *
        Math.sin(lat2) -
        Math.sin(lat1) *
        Math.cos(lat2) *
        Math.cos(dLng);

    const initialBearing =
        this.toDegrees(
            Math.atan2(y, x)
        );

    return (initialBearing + 360) % 360;

}

}