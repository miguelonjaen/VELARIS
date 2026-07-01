import { TelemetryService } from "@/core/services/TelemetryService";

export interface ElectronTelemetryApi {
    on(eventName: "vessel-telemetry", handler: (data: unknown) => void): void;
    removeListener(eventName: "vessel-telemetry", handler: (data: unknown) => void): void;
}

export type TelemetryObserver = (data: unknown) => void;

export class ElectronTelemetryAdapter {

    private unsubscribeCurrent: (() => void) | null = null;

    constructor(
        private readonly telemetry: TelemetryService
    ) {}

    public start(
        api: ElectronTelemetryApi | null | undefined,
        observer?: TelemetryObserver
    ): boolean {
        this.stop();

        if (!this.isElectronTelemetryApi(api)) return false;

        const handler = (data: unknown) => {
            this.forward(data);

            observer?.(data);
        };

        api.on("vessel-telemetry", handler);

        this.unsubscribeCurrent = () => {
            api.removeListener("vessel-telemetry", handler);
        };

        return true;
    }

    public forward(data: unknown): void {
        if (this.isTelemetryMessage(data)) {
            this.telemetry.process(data);
        }
    }

    public stop(): void {
        this.unsubscribeCurrent?.();
        this.unsubscribeCurrent = null;
    }

    private isTelemetryMessage(data: unknown): data is { type: string } {
        return typeof data === "object" &&
            data !== null &&
            "type" in data &&
            typeof (data as { type?: unknown }).type === "string";
    }

    private isElectronTelemetryApi(api: unknown): api is ElectronTelemetryApi {
        return typeof api === "object" &&
            api !== null &&
            "on" in api &&
            "removeListener" in api &&
            typeof (api as { on?: unknown }).on === "function" &&
            typeof (api as { removeListener?: unknown }).removeListener === "function";
    }

}
