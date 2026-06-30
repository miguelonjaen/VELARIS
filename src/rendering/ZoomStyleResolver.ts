export class ZoomStyleResolver {

    public getShipSize(zoom: number): number {

        if (zoom <= 8) return 10;

        if (zoom <= 10) return 14;

        if (zoom <= 12) return 18;

        if (zoom <= 14) return 26;

        return 30;

    }

}