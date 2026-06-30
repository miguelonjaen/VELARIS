import { ContactRepository } from "@/data/ContactRepository";
import { Contact } from "./contacts/Contact";
import { Vessel } from "./contacts/Vessel";
import { TacticalTargetMapper } from "./mappers/TacticalTargetMapper";
import { TacticalTarget } from "./models/TacticalTarget";

export class TacticalEngine {

    private readonly targetMapper = new TacticalTargetMapper();

    constructor(

        private readonly contacts: ContactRepository,
        

    ) {}

    public getContacts(): Contact[] {

        return this.contacts.getAll();

    }
    

    public getVessels(): Vessel[] {

        return this.contacts
            .getAll()
            .filter(
                contact => contact instanceof Vessel
            ) as Vessel[];

    }

    public getContact(id: string): Contact | undefined {

        return this.contacts.getById(id);

    }

    public addContact(contact: Contact): void {

        if (this.contacts.exists(contact.id)) {

            this.contacts.update(contact);

            return;

        }

        this.contacts.add(contact);

    }

    public removeContact(id: string): void {

        this.contacts.remove(id);

    }

    public getTargets(): TacticalTarget[] {

    return this.getVessels().map(
        vessel => this.targetMapper.map(vessel)
    );

}
}