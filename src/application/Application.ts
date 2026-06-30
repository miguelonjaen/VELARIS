import { ContactRepository } from "@/data/ContactRepository";
import { MemoryRepository } from "@/data/memory/MemoryRepository";

import { Contact } from "@/tactical/contacts/Contact";
import { TacticalEngine } from "@/tactical/TacticalEngine";
import { AISService } from "@/services/AISService";
import { RenderingEngine } from "@/rendering/RenderingEngine";


export class Application {

    public readonly contacts: ContactRepository;

    public readonly tactical: TacticalEngine;

    public readonly ais: AISService;

    public readonly rendering: RenderingEngine;



    constructor() {

        this.contacts = new ContactRepository(

            new MemoryRepository<Contact>(contact => contact.id)

        );

        this.tactical = new TacticalEngine(

            this.contacts

        );
        this.ais = new AISService(this.contacts);
        this.rendering = new RenderingEngine();

    }
    

}