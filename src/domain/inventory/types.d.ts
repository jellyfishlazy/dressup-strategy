export type InventoryMine = Record<string, string[]>;

export interface InventoryDecoded {
  mine: InventoryMine;
  size: number;
}

export interface InventoryClothing {
  id: string;
  own: boolean;
  [key: string]: any;
}

export interface InventoryOptions<T extends InventoryClothing = InventoryClothing> {
  typeOf(clothing: T): string;
}

export interface Inventory<T extends InventoryClothing = InventoryClothing> {
  mine: InventoryMine;
  size: number;
  filter(clothes: T[]): void;
  serialize(): string;
  deserialize(raw: string): void;
  update(clothes: T[]): void;
}

export interface LegacyStorageLike {
  myClothesNew?: string;
  myClothes?: string;
}

export type InventoryStorage = Storage | LegacyStorageLike;

export interface CookieDocumentLike {
  cookie: string;
}

export interface InventoryReadResult {
  current: string | undefined;
  legacy: string | undefined;
}
