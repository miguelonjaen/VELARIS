import { CoreState } from "@/core/CoreState";
import { GaulosCore } from "@/core/GaulosCore";

export class TelemetryService {

    constructor(
        private readonly state: CoreState,
        private readonly core?: GaulosCore
    ) {}

    public process(data: any): void {

        switch (data.type) {

            case "GPS":
                this.processGPS(data);
                break;

            case "HEADING":
                this.processHeading(data);
                break;

            case "AIS":
                this.processAIS(data);
                break;

            case "WIND":
                this.processWind(data);
                break;

            case "DEPTH":
                this.processDepth(data);
                break;

            case "NMEA_INVALID":
                this.processInvalid(data);
                break;
        }
    }

    private processGPS(data: any): void {

        // Solo los campos que trae la sentencia (`fields` de NMEAParser): GGA no aporta SOG/COG
        // (antes los ponía a 0) y VTG no aporta posición (antes la ponía en 0,0). Sin `fields`
        // (emisores antiguos) se mantiene el criterio anterior. Una posición 0,0 nunca es válida.
        const present = data.fields;
        const positionValue = Number.isFinite(data.lat) && Number.isFinite(data.lng)
            && Math.abs(data.lat) <= 90 && Math.abs(data.lng) <= 180
            && !(data.lat === 0 && data.lng === 0);
        const hasPosition = (present ? present.position === true : true) && positionValue;
        const hasSog = (present ? present.sog === true : data.sog !== undefined) && Number.isFinite(data.sog);
        const hasCog = (present ? present.cog === true : data.cog !== undefined) && Number.isFinite(data.cog);

        if (!hasPosition && !this.state.shipPosition) {
            // Sin posición conocida no se inventa ninguna (no se publica un movimiento en 0,0).
            this.core?.updateVessel({
                ...(hasSog ? { sog: data.sog } : {}),
                ...(hasCog ? { cog: data.cog } : {})
            });
            return;
        }

        const lat = hasPosition ? data.lat : this.state.shipPosition!.lat;
        const lng = hasPosition ? data.lng : this.state.shipPosition!.lng;
        const sog = hasSog ? data.sog : this.state.sog;
        const cog = hasCog ? data.cog : this.state.cog;

        this.state.updatePosition(
            lat,
            lng,
            sog,
            cog
        );

        this.core?.updateVessel({
            ...(hasPosition ? { position: { lat: data.lat, lng: data.lng } } : {}),
            ...(hasSog ? { sog: data.sog } : {}),
            ...(hasCog ? { cog: data.cog } : {}),
            ...(data.heading !== undefined && Number.isFinite(data.heading)
                ? { heading: data.heading }
                : {})
        });

    }

    private processHeading(data: any): void {

        if (data.heading !== undefined && Number.isFinite(data.heading)) {
            this.core?.updateVessel({
                heading: data.heading
            });
        }

    }

    private processAIS(data: any): void {}

    private processWind(data: any): void {
        // El canal heredado almacena ángulo relativo; MWD se conserva en BoatInstrumentStore.
        if (data.angleReference === "trueNorth") return;

        this.state.updateWind(
            data.speed,
            data.angle
        );

        this.core?.updateEnvironment({
            wind: {
                speed: data.speed,
                angle: data.angle
            }
        });

    }

    private processDepth(data: any): void {

        this.state.updateDepth(
            data.depth
        );

        this.core?.updateEnvironment({
            depth: data.depth
        });

    }

    private processInvalid(data: any): void {}
}
