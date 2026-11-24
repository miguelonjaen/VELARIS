import { ContactRepository } from "@/data/ContactRepository";
import { MemoryRepository } from "@/data/memory/MemoryRepository";

import { Contact } from "@/tactical/contacts/Contact";
import { TacticalEngine } from "@/tactical/TacticalEngine";
import { AISService } from "@/features/traffic/services/AISService";
import { RenderingEngine } from "@/rendering/RenderingEngine";
import { CoreState } from "@/core/CoreState";
import { TelemetryService } from "@/core/services/TelemetryService";
import { SimulationService } from "@/core/services/SimulationService";
import { CoreEvents } from "@/core/events/CoreEvents";
import { SynchronousCoreEvents } from "@/core/events/SynchronousCoreEvents";
import { ElectronTelemetryAdapter } from "@/platform/telemetry/ElectronTelemetryAdapter";
import { GaulosCore } from "@/core/GaulosCore";
import { NavigationAdapter } from "@/core/adapters/NavigationAdapter";
import { SharedNavigationState, type NavigationFreshnessPolicy } from "@/core/navigation/SharedNavigationState";
import { droidReadingsFromLinkPosition } from "@/core/navigation/SharedNavigationFeeds";
import { STALE_LIMITS_SECONDS } from "@/lib/sensorQuality";
import { BoatInstrumentStore } from "@/core/instruments/BoatInstrumentStore";
import { POSITION_STALE_MS, subscribeLinkPositions } from "@/features/link/gaulosLinkStore";

/**
 * Umbrales de caducidad existentes en GAULOS. La posición real usa la hora
 * de observación (recepción si el emisor no trae hora); los demás campos
 * conservan la referencia de recepción de sensorQuality y GAULOS Link.
 *
 * SIMULATOR (simulador NMEA por TCP) usa las mismas caducidades que los
 * instrumentos, porque emite las mismas sentencias; su prioridad es la más baja.
 */
function createNavigationFreshnessPolicy(): NavigationFreshnessPolicy {
    const boat = (seconds: number) => ({ maxAgeMs: seconds * 1000, ageFrom: "receivedAt" as const });
    const droid = { maxAgeMs: POSITION_STALE_MS, ageFrom: "receivedAt" as const };
    return {
        // Position age is measured from the fix, not its arrival: a delayed
        // RMC/phone fix must not become fresh simply because it arrived now.
        position: { BOAT: { ...boat(STALE_LIMITS_SECONDS.gps), ageFrom: "observedAt" },
            DROID: { ...droid, ageFrom: "observedAt" }, SIMULATOR: boat(STALE_LIMITS_SECONDS.gps) },
        sog: { BOAT: boat(STALE_LIMITS_SECONDS.sog), DROID: droid, SIMULATOR: boat(STALE_LIMITS_SECONDS.sog) },
        cog: { BOAT: boat(STALE_LIMITS_SECONDS.gps), DROID: droid, SIMULATOR: boat(STALE_LIMITS_SECONDS.gps) },
        headingTrue: { BOAT: boat(STALE_LIMITS_SECONDS.heading), DROID: droid, SIMULATOR: boat(STALE_LIMITS_SECONDS.heading) },
        headingMagnetic: { BOAT: boat(STALE_LIMITS_SECONDS.heading), DROID: droid, SIMULATOR: boat(STALE_LIMITS_SECONDS.heading) }
    };
}




export class Application {

    public readonly events: CoreEvents;

    public readonly state: CoreState;

    public readonly contacts: ContactRepository;

    public readonly tactical: TacticalEngine;

    public readonly ais: AISService;

    public readonly telemetry: TelemetryService;

    public readonly electronTelemetry: ElectronTelemetryAdapter;

    public readonly rendering: RenderingEngine;

    public readonly simulation: SimulationService;


    public readonly core: GaulosCore;

    public readonly navigationAdapter: NavigationAdapter;

    /** Estado de navegación compartido: selección de fuente por campo (barco > Droid). */
    public readonly navigationState: SharedNavigationState;

    /** Lecturas de los instrumentos del barco (profundidad, viento medido, motor, baterías, depósitos). */
    public readonly boatInstruments: BoatInstrumentStore;

    /** Lecturas NMEA simuladas, aisladas de SmartShield y de la fuente BOAT. */
    public readonly simulatorInstruments: BoatInstrumentStore;


    constructor() {
        const events = new SynchronousCoreEvents();

        this.events = events;

        this.state = new CoreState(events);

        this.contacts = new ContactRepository(
            new MemoryRepository<Contact>(contact => contact.id)
        );

        this.tactical = new TacticalEngine(
            this.contacts
        );

        this.ais = new AISService(this.contacts);

        this.core = new GaulosCore();

        this.telemetry = new TelemetryService(this.state, this.core);

        this.navigationState = new SharedNavigationState(createNavigationFreshnessPolicy());

        this.boatInstruments = new BoatInstrumentStore();

        this.simulatorInstruments = new BoatInstrumentStore();

        this.electronTelemetry = new ElectronTelemetryAdapter(
            this.telemetry,
            this.navigationState,
            Date.now,
            this.boatInstruments,
            this.simulatorInstruments
        );

        if (typeof window !== "undefined") {
            subscribeLinkPositions(position => {
                this.navigationState.ingest(droidReadingsFromLinkPosition(position));
            });
        }


        this.simulation = new SimulationService();

        this.rendering = new RenderingEngine();

        this.navigationAdapter = new NavigationAdapter({
            core: this.core,
            navigationState: this.navigationState
        });
        this.navigationAdapter.start();
    }
    

}
