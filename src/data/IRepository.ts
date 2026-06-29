export interface IRepository<T> {
  add(item: T): void;

  update(item: T): void;

  remove(id: string): void;

  getById(id: string): T | undefined;

  exists(id: string): boolean;

  getAll(): T[];

  clear(): void;

  count(): number;
}