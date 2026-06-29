import { ContactType } from "./ContactType";

export class Contact {

    constructor(

        public readonly id: string,

        public readonly type: ContactType,

        public lat: number,

        public lng: number

    ) {}

    public visible = true;

    public selected = false;

}