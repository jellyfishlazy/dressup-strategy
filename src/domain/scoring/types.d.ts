export type FeatureName = 'simple' | 'cute' | 'active' | 'pure' | 'cool';
export type FeatureSign = '+' | '-';
export type RawGrade = string | number;
export type RatingTuple = [RawGrade | '', RawGrade | '', number, number | undefined];
export type ScorePair = [number, number];
export type ScoreMap = Record<FeatureName, ScorePair>;
export type RawScoreMap = Partial<Record<FeatureName, number>>;

export interface ClothesType {
  type: string;
  mainType: string;
  score: Record<string, number>;
  deviation: Record<string, number | undefined>;
}

export interface Criteria extends Partial<Record<FeatureName, number>> {
  levelName?: string;
  highscore1?: FeatureName;
  highscore2?: FeatureName;
  balance?: boolean;
  bonus?: ScoreBonus[];
  [key: string]: unknown;
}

export type BonusFilterResult = [number, RawScoreMap];

export interface ScoreBonus {
  replace?: boolean;
  filter(clothing: ScoringClothing): BonusFilterResult;
}

export interface ScoreByCategoryState {
  scores: ScoreMap;
  record(category: FeatureName, major: number, minor: number): void;
  add(other: ScoreByCategoryState): void;
  round(): void;
  addRaw(filters: Criteria, rawdata: RawScoreMap): void;
  f(): void;
}

export interface ClothingDependency {
  sourceType: string;
  depNum: number;
  c: ScoringClothing;
}

export interface ScoringClothing {
  own: boolean;
  name: string;
  type: ClothesType;
  id: string;
  longid: string;
  stars: unknown;
  simple: RatingTuple;
  cute: RatingTuple;
  active: RatingTuple;
  pure: RatingTuple;
  cool: RatingTuple;
  tags: string[];
  tagsRaw: string;
  source: string;
  version: unknown;
  deps: ClothingDependency[];
  tmpScoreByCategory?: ScoreByCategoryState;
  bonusByCategory?: ScoreByCategoryState;
  isF?: number;
  tmpScore?: number;
  bonusScore?: number;
  sumScore?: number;
  addDep(sourceType: string, depNum: number, clothing: ScoringClothing): void;
  getDeps(indent: string, parentDepNum: number): string;
  calc(filters: Criteria): void;
  toCsv(): unknown[];
}
