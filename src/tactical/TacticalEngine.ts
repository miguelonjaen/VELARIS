import { ContactRepository } from "@/data/ContactRepository";
import { Contact } from "./contacts/Contact";

export class TacticalEngine {

    constructor(

        private readonly contacts: ContactRepository

    ) {}

    getContacts(): Contact[] {

        return this.contacts.getAll();

    }

    getContact(id: string): Contact | undefined {

        return this.contacts.getById(id);

    }

    addContact(contact: Contact): void {

        if (this.contacts.exists(contact.id)) {

            this.contacts.update(contact);

            return;

        }

        this.contacts.add(contact);

    }

    removeContact(id: string): void {

        this.contacts.remove(id);

    }

}