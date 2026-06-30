import { ShipData } from "@/shared/types";
import { AISContact } from "../contacts/AISContact";
import { IMapper } from "./IMapper";
import { TargetAIS } from "@/tactical/models/TargetAIS";

export class AISMapper implements IMapper<TargetAIS, AISContact> {

    map(source: TargetAIS): AISContact {

    const contact = new AISContact(
        source.mmsi,
        source.lat,
        source.lng
    );

    contact.mmsi = source.mmsi;
    contact.cog = source.cog;
    contact.sog = source.sog;

    
    return contact;
}

}