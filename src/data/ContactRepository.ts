import { Contact } from "@/tactical/contacts/Contact";
import { IRepository } from "./IRepository";

export class ContactRepository {

  constructor(
    private readonly repository: IRepository<Contact>
  ) {}

  add(contact: Contact): void {
    this.repository.add(contact);
  }

  update(contact: Contact): void {
    this.repository.update(contact);
  }

  remove(id: string): void {
    this.repository.remove(id);
  }

  getById(id: string): Contact | undefined {
    return this.repository.getById(id);
  }

  exists(id: string): boolean {
    return this.repository.exists(id);
  }

  getAll(): Contact[] {
    return this.repository.getAll();
  }

  clear(): void {
    this.repository.clear();
  }

  count(): number {
    return this.repository.count();
  }

}