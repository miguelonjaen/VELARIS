export class NavigationState {

    constructor(

        public distanceToWaypoint = 0,

        public distanceRemaining = 0,

        public bearingToWaypoint = 0,

        public crossTrackError = 0,

        public eta = "",

        public vmg = 0

    ) {}

}