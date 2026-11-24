import { Route } from "./Route";

export class NavigationSession {

    constructor(

        public route: Route,

        public activeWaypointIndex = 0,

        public startedAt: Date = new Date(),

        public finishedAt?: Date,

        public isNavigating = false

    ) {}

}