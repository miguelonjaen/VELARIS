import { Route } from "./Route";
import { Waypoint } from "../../tactical/contacts/Waypoint";

export class RouteBuilder {

    private readonly route: Route;

    constructor(routeName = "Nueva Ruta") {

        this.route = new Route(
            crypto.randomUUID(),
            routeName
        );

    }

    addWaypoint(waypoint: Waypoint): void {

    this.route.waypoints.push(waypoint);

}

removeWaypoint(id: string): void {

    this.route.waypoints =
        this.route.waypoints.filter(w => w.id !== id);

}

removeLastWaypoint(): void {

    this.route.waypoints.pop();

}

clear(): void {

    this.route.waypoints = [];

}

    getRoute(): Route {

        return this.route;

    }

}