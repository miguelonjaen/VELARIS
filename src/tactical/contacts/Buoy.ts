import { Contact } from "./Contact";
import { ContactType } from "./ContactType";

export class Buoy extends Contact {

    public buoyType = "";

    constructor(
        id: string,
        lat: number,
        lng: number
    ) {

        super(
            id,
            ContactType.Buoy,
            lat,
            lng
        );

    }

}