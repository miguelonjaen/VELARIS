import { ContactRepository } from "@/data/ContactRepository";
import { MemoryRepository } from "@/data/memory/MemoryRepository";

import { Contact } from "@/tactical/contacts/Contact";
import { TacticalEngine } from "@/tactical/TacticalEngine";
import { AISService } from "@/services/AISService";
import { RenderingEngine } from "@/rendering/RenderingEngine";
import { CoreState } from "@/core/CoreState";
import { TelemetryService } from "@/core/services/TelemetryService";
import { SimulationService } from "@/core/services/SimulationService";
import { CoreEvents } from "@/core/events/CoreEvents";
import { SynchronousCoreEvents } from "@/core/events/SynchronousCoreEvents";
import { NavigationService } from "@/core/services/NavigationService";


export class Application {

    public readonly events: CoreEvents;

    public readonly state: CoreState;

    public readonly contacts: ContactRepository;

    public readonly tactical: TacticalEngine;

    public readonly ais: AISService;

    public readonly telemetry: TelemetryService;

    public readonly rendering: RenderingEngine;

    public readonly simulation: SimulationService;

    public readonly navigation: NavigationService;



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

    this.telemetry = new TelemetryService(this.state);

    this.navigation = new NavigationService(this.events);

    this.simulation = new SimulationService();

    this.rendering = new RenderingEngine();

}
    

}
