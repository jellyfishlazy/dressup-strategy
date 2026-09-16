export interface BigUsePieceType {
  type?: string;
}

export interface BigUsePiece {
  name?: string;
  id?: string | number;
  type?: BigUsePieceType;
  [key: string]: unknown;
}

export interface BigUseComparison {
  scoreA: number;
  scoreB: number;
  close: boolean;
  winner: 'A' | 'B' | null;
}

export interface AutocompleteSuggestion<T> {
  value: string;
  data: T;
}
