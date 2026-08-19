import { Waypoint } from "../../tactical/contacts/Waypoint";

export class Route {

    constructor(

        public id: string,

        public name: string,

        public waypoints: Waypoint[] = [],

        public createdAt: Date = new Date()

    ) {}

}