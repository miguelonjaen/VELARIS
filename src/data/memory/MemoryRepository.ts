import { IRepository } from "../IRepository";

export class MemoryRepository<T> implements IRepository<T> {

  private readonly items = new Map<string, T>();

  constructor(
    private readonly getId: (item: T) => string
  ) {}

  add(item: T): void {
    this.items.set(this.getId(item), item);
  }

  update(item: T): void {
    this.items.set(this.getId(item), item);
  }

  remove(id: string): void {
    this.items.delete(id);
  }

  getById(id: string): T | undefined {
    return this.items.get(id);
  }

  exists(id: string): boolean {
    return this.items.has(id);
  }

  getAll(): T[] {
    return [...this.items.values()];
  }

  clear(): void {
    this.items.clear();
  }

  count(): number {
    return this.items.size;
  }

}