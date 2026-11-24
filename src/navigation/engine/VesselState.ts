export class VesselState {

    constructor(

        public lat: number,

        public lng: number,

        public sog: number,

        public cog: number,

        public heading: number,

        public depth: number,

        public tws: number,

        public twd: number,

        public timestamp: Date = new Date()

    ) {}

}