import { Vessel } from "../contacts/Vessel";
import { TacticalTarget } from "../models/TacticalTarget";

export class TacticalTargetMapper {

    public map(vessel: Vessel): TacticalTarget {

        return {

            id: vessel.id,

            mmsi: "",

            nombre: "",

            lat: vessel.lat,

            lng: vessel.lng,

            cog: vessel.cog,

            sog: vessel.sog,

            cpa: undefined,

            tcpa: undefined,

            risk: "safe",

            selected: vessel.selected,

            visible: vessel.visible

        };

    }

}