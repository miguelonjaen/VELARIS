import { AISContact } from "../contacts/AISContact";
import { TacticalTarget } from "../models/TacticalTarget";

export class TacticalTargetMapper {

    public map(contact: AISContact): TacticalTarget {

        
        return {

            id: contact.id,

            mmsi: contact.mmsi,

            nombre: contact.id,   // temporalmente

            lat: contact.lat,

            lng: contact.lng,

            cog: contact.cog,

            sog: contact.sog,

            cpa: undefined,

            tcpa: undefined,

            risk: "safe",

            selected: contact.selected,

            visible: contact.visible

        };

    }

}