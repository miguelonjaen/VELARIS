import { TelemetryService } from "@/core/services/TelemetryService";
import type { TelemetryMessage } from "@/core/types/TelemetryMessage";
import type { SharedNavigationState } from "@/core/navigation/SharedNavigationState";
import { boatReadingsFromTelemetry, simulatorReadingsFromTelemetry } from "@/core/navigation/SharedNavigationFeeds";
import type { BoatInstrumentStore } from "@/core/instruments/BoatInstrumentStore";

/**
 * Canales del proceso principal:
 *  - "vessel-telemetry": instrumentos del barco (puerto serie). Fuente BOAT.
 *  - "simulator-telemetry": simulador NMEA por TCP, { sourceId, message }. Fuente
 *    SIMULATOR. Solo alimenta el estado compartido: no llega al núcleo de
 *    telemetría existente ni al observador, que lo tratarían como datos reales.
 */
export type ElectronTelemetryChannel = "vessel-telemetry" | "simulator-telemetry";

export interface ElectronTelemetryApi {
    on(eventName: ElectronTelemetryChannel, handler: (data: unknown) => void): void;
    removeListener(eventName: ElectronTelemetryChannel, handler: (data: unknown) => void): void;
}

export type TelemetryObserver = (data: unknown) => void;

export class ElectronTelemetryAdapter {

    private readonly counts = new Map<string, { channel: string; type: string; count: number; at: number; detail: string }>();
    public diagnostics() { return [...this.counts.values()].map(row => ({ ...row })); }
    private observe(channel: string, data: unknown): void {
        if (!this.isTelemetryMessage(data)) return;
        const message = data as { type: string; line?: string; reason?: string };
        const detail = message.line ? message.line.split(',')[0].slice(0, 12) : '';
        const key = `${channel}:${message.type}:${detail}`;
        if (!this.counts.has(key) && this.counts.size >= 64) this.counts.delete(this.counts.keys().next().value!);
        this.counts.set(key, { channel, type: message.type, count: (this.counts.get(key)?.count ?? 0) + 1, at: this.clock(), detail: message.reason ?? detail });
    }
    private unsubscribeCurrent: (() => void) | null = null;

    constructor(
        private readonly telemetry: TelemetryService,
        private readonly navigationState?: SharedNavigationState,
        private readonly clock: () => number = Date.now,
        /** Profundidad, viento medido, motor, baterías y depósitos: solo de los instrumentos del barco. */
        private readonly boatInstruments?: BoatInstrumentStore,
        /** Almacén aislado: conserva SIMULATOR y nunca alimenta alarmas físicas. */
        private readonly simulatorInstruments?: BoatInstrumentStore
    ) {}

    public start(
        api: ElectronTelemetryApi | null | undefined,
        observer?: TelemetryObserver
    ): boolean {
        this.stop();

        if (!this.isElectronTelemetryApi(api)) return false;

        const handler = (data: unknown) => {
            this.observe("instrumentos", data);
            this.forward(data);
            this.feedSharedNavigationState(data);

            observer?.(data);
        };

        const simulatorHandler = (data: unknown) => {
            this.observe("solo visual", (data as { message?: unknown })?.message);
            this.feedSimulatorNavigationState(data);
        };

        api.on("vessel-telemetry", handler);
        api.on("simulator-telemetry", simulatorHandler);

        this.unsubscribeCurrent = () => {
            api.removeListener("vessel-telemetry", handler);
            api.removeListener("simulator-telemetry", simulatorHandler);
        };

        return true;
    }

    /**
     * Solo los mensajes que llegan del proceso principal (instrumentos del barco)
     * alimentan la fuente BOAT. La simulación usa forward() y no pasa por aquí.
     */
    private feedSharedNavigationState(data: unknown): void {
        if (!this.isTelemetryMessage(data)) return;
        const receivedAt = this.clock();
        this.navigationState?.ingest(boatReadingsFromTelemetry(data as TelemetryMessage, receivedAt));
        this.boatInstruments?.ingest(data as TelemetryMessage, receivedAt);
    }

    /** Datos del simulador NMEA (TCP): fuente SIMULATOR, nunca BOAT. */
    private feedSimulatorNavigationState(data: unknown): void {
        if (typeof data !== "object" || data === null) return;
        const { sourceId, message } = data as { sourceId?: unknown; message?: unknown };
        if (typeof sourceId !== "string" || !sourceId || !this.isTelemetryMessage(message)) return;
        const receivedAt = this.clock();
        this.navigationState?.ingest(simulatorReadingsFromTelemetry(message as TelemetryMessage, receivedAt, sourceId));
        this.simulatorInstruments?.ingest(message as TelemetryMessage, receivedAt);
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
