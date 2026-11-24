import { ShipData } from "@/shared/types";
import { ContactRepository } from "@/data/ContactRepository";
import { AISMapper } from "@/tactical/mappers/AISMapper";
import { TargetAIS } from "@/tactical/models/TargetAIS";

export class AISService {

    private readonly mapper = new AISMapper();

    constructor(
        private readonly contacts: ContactRepository
    ) {}

    public update(targets: TargetAIS[]): void {

        this.contacts.clear();

        for (const target of targets) {

            const contact = this.mapper.map(target);

            this.contacts.add(contact);

        }

    }

}