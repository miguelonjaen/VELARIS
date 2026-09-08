import { Route } from "./Route";
import { RouteCalculator, RouteValidationResult } from "./RouteCalculator";

export type SimulationPath = [number, number][];

const routeCalculator = new RouteCalculator();

export function routeToSimulationPath(route: Route): SimulationPath {
    return route.waypoints.map(waypoint => [waypoint.lat, waypoint.lng]);
}

export function validateSimulationRoute(route: Route): RouteValidationResult {
    return routeCalculator.validateRoute(route);
}

export interface SimulationRouteResult extends RouteValidationResult {
    path: SimulationPath;
}

export function getSimulationPath(route: Route): SimulationRouteResult {
    const validation = validateSimulationRoute(route);

    return {
        ...validation,
        path: validation.valid ? routeToSimulationPath(route) : []
    };
}
