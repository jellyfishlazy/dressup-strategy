import type { Criteria, ScoringClothing } from '../scoring/types.d.ts';

export interface ShoppingCartTotal {
  name: string;
  sumScore: number;
  toCsv(): Array<string | number>;
}

export type ShoppingCartMap<T = ScoringClothing> = Record<string, T>;
export type ShoppingCartInput<T = ScoringClothing> = T[] | Record<string, T>;
export type ShoppingCartComparator<T = ScoringClothing> = (a: T, b: T) => number;

export interface ShoppingCartBase<T = ScoringClothing> {
  cart: ShoppingCartMap<T>;
  totalScore: ShoppingCartTotal;
  clear(): void;
  remove(type: string): void;
  putAll(clothes: ShoppingCartInput<T>): void;
  put(clothing: T): void;
  toList(sortBy: ShoppingCartComparator<T>): T[];
  calc(criteria: Criteria): void;
  validate(criteria: Criteria, accNum?: number): void;
}

export interface MatcherShoppingCart<T = ScoringClothing> extends ShoppingCartBase<T> {
  contains(clothing: T): boolean;
}

export interface MaterialShoppingCart<T = ScoringClothing>
  extends Omit<ShoppingCartBase<T>, 'totalScore'> {
  totalScore: ShoppingCartTotal | null;
  contains(clothing: T): number;
}
