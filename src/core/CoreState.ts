export class CoreState {

    public shipPosition: {
        lat: number;
        lng: number;
    } | null = null;

    public sog = 0;

    public cog = 0;

    public depth = 0;

    public wind = {
        speed: 0,
        angle: 0
    };

    public updatePosition(
        lat: number,
        lng: number,
        sog: number,
        cog: number
    ): void {

        this.shipPosition = {
            lat,
            lng
        };

        this.sog = sog;
        this.cog = cog;

    }

}