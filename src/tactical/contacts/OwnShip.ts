import { Vessel } from "./Vessel";
import { ContactType } from "./ContactType";

export class OwnShip extends Vessel {

    constructor(
        id: string,
        lat: number,
        lng: number
    ) {

        super(
            id,
            ContactType.OwnShip,
            lat,
            lng
        );

    }

}