import { Route } from "./Route";

export class RouteManager {

    private currentRoute: Route | null = null;

    setRoute(route: Route) {

        this.currentRoute = route;

    }

    getRoute() {

        return this.currentRoute;

    }

    clear() {

        this.currentRoute = null;

    }

}