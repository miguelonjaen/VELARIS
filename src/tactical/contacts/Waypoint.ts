import { Contact } from "./Contact";
import { ContactType } from "./ContactType";

export class Waypoint extends Contact {

    public name = "";

    public radius = 0;

    constructor(
        id: string,
        lat: number,
        lng: number
    ) {

        super(
            id,
            ContactType.Waypoint,
            lat,
            lng
        );

    }

}