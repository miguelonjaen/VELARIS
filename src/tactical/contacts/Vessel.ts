import { Contact } from "./Contact";
import { ContactType } from "./ContactType";

export class Vessel extends Contact {

    public cog = 0;

    public sog = 0;

    public heading = 0;

    public length = 0;

    public beam = 0;

    constructor(

        id: string,

        type: ContactType,

        lat: number,

        lng: number

    ) {

        super(
            id,
            type,
            lat,
            lng
        );

    }

}