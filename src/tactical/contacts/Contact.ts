import { ContactType } from "./ContactType";

export class Contact {
  id: string;

  type: ContactType;

  lat: number;

  lng: number;

  cog: number;

  sog: number;

  selected: boolean;

  visible: boolean;

  constructor(
    id: string,
    type: ContactType,
    lat: number,
    lng: number
  ) {
    this.id = id;

    this.type = type;

    this.lat = lat;

    this.lng = lng;

    this.cog = 0;

    this.sog = 0;

    this.selected = false;

    this.visible = true;
  }
}