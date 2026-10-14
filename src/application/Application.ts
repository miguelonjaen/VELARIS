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
import { VelarisCore } from "@/core/VelarisCore";
import { NavigationAdapter } from "@/core/adapters/NavigationAdapter";




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


    public readonly core: VelarisCore;

    public readonly navigationAdapter: NavigationAdapter;


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

        this.core = new VelarisCore();

        this.telemetry = new TelemetryService(this.state, this.core);

        this.electronTelemetry = new ElectronTelemetryAdapter(this.telemetry);


        this.simulation = new SimulationService();

        this.rendering = new RenderingEngine();

        this.navigationAdapter = new NavigationAdapter({
            core: this.core
        });
        this.navigationAdapter.start();
    }
    

}
