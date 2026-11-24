import { Route } from "./Route";
import { Waypoint } from "../../tactical/contacts/Waypoint";

export interface RouteValidationResult {
    valid: boolean;
    errors: string[];
}

export interface CalculatedRoute extends RouteValidationResult {
    totalDistanceNm: number;
    legDistancesNm: number[];
    legBearings: number[];
}

const EARTH_RADIUS_NM = 3440.065;

export function normalizeBearing(bearing: number): number {
    const normalized = ((bearing % 360) + 360) % 360;
    return Math.min(359.999, normalized);
}

export function calculateDistanceNmBetween(
    from: Waypoint,
    to: Waypoint
): number {
    const latitude1 = from.lat * Math.PI / 180;
    const latitude2 = to.lat * Math.PI / 180;
    const deltaLatitude = (to.lat - from.lat) * Math.PI / 180;
    const deltaLongitude = (to.lng - from.lng) * Math.PI / 180;
    const haversine = Math.sin(deltaLatitude / 2) ** 2
        + Math.cos(latitude1)
        * Math.cos(latitude2)
        * Math.sin(deltaLongitude / 2) ** 2;

    return EARTH_RADIUS_NM
        * 2
        * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function calculateBearingBetween(
    from: Waypoint,
    to: Waypoint
): number {
    const latitude1 = from.lat * Math.PI / 180;
    const latitude2 = to.lat * Math.PI / 180;
    const deltaLongitude = (to.lng - from.lng) * Math.PI / 180;
    const y = Math.sin(deltaLongitude) * Math.cos(latitude2);
    const x = Math.cos(latitude1) * Math.sin(latitude2)
        - Math.sin(latitude1)
        * Math.cos(latitude2)
        * Math.cos(deltaLongitude);

    return normalizeBearing(Math.atan2(y, x) * 180 / Math.PI);
}

export function validateRoute(route: Route): RouteValidationResult {
    const errors: string[] = [];
    const waypoints = route?.waypoints ?? [];

    if (waypoints.length === 0) {
        errors.push("Route must contain at least one waypoint.");
    }

    if (waypoints.length < 2) {
        errors.push("Route must contain at least two waypoints for navigation.");
    }

    waypoints.forEach((waypoint, index) => {
        if (!Number.isFinite(waypoint?.lat) || !Number.isFinite(waypoint?.lng)) {
            errors.push(`Waypoint ${index} must have finite latitude and longitude.`);
        }

        const previous = waypoints[index - 1];
        if (previous
            && previous.lat === waypoint.lat
            && previous.lng === waypoint.lng) {
            errors.push(`Waypoints ${index - 1} and ${index} must not be duplicates.`);
        }
    });

    return {
        valid: errors.length === 0,
        errors
    };
}

export class RouteCalculator {

    public calculateDistanceNm(route: Route): number {
        return this.calculateTotalDistanceNm(route);
    }

    public calculateLegDistancesNm(route: Route): number[] {
        return route.waypoints.slice(1).map((waypoint, index) => (
            calculateDistanceNmBetween(route.waypoints[index], waypoint)
        ));
    }

    public calculateBearing(from: Waypoint, to: Waypoint): number {
        return calculateBearingBetween(from, to);
    }

    public calculateLegBearings(route: Route): number[] {
        return route.waypoints.slice(1).map((waypoint, index) => (
            this.calculateBearing(route.waypoints[index], waypoint)
        ));
    }

    public calculateTotalDistanceNm(route: Route): number {
        return this.calculateLegDistancesNm(route)
            .reduce((total, distance) => total + distance, 0);
    }

    public validateRoute(route: Route): RouteValidationResult {
        return validateRoute(route);
    }

    public calculateRoute(route: Route): CalculatedRoute {
        const validation = this.validateRoute(route);

        return {
            ...validation,
            totalDistanceNm: this.calculateTotalDistanceNm(route),
            legDistancesNm: this.calculateLegDistancesNm(route),
            legBearings: this.calculateLegBearings(route)
        };
    }
}

export const calculateDistanceNm = (route: Route): number =>
    new RouteCalculator().calculateDistanceNm(route);

export const calculateLegDistancesNm = (route: Route): number[] =>
    new RouteCalculator().calculateLegDistancesNm(route);

export const calculateBearing = (from: Waypoint, to: Waypoint): number =>
    new RouteCalculator().calculateBearing(from, to);

export const calculateLegBearings = (route: Route): number[] =>
    new RouteCalculator().calculateLegBearings(route);

export const calculateTotalDistanceNm = (route: Route): number =>
    new RouteCalculator().calculateTotalDistanceNm(route);

export const calculateRoute = (route: Route): CalculatedRoute =>
    new RouteCalculator().calculateRoute(route);