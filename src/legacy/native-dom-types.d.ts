export interface DomCollection {
  readonly length: number;
  [index: number]: any;
  addClass(...names: string[]): DomCollection;
  removeClass(...names: string[]): DomCollection;
  toggleClass(name: string): DomCollection;
  hasClass(name: string): boolean;
  attr(name: string): any;
  attr(name: string, value: any): DomCollection;
  attr(values: Record<string, any>): DomCollection;
  prop(name: string): any;
  prop(name: string, value: any): DomCollection;
  css(name: string): any;
  css(name: string, value: any): DomCollection;
  css(values: Record<string, any>): DomCollection;
  text(): string;
  text(value: any): DomCollection;
  html(): string;
  html(value: any): DomCollection;
  val(): any;
  val(value: any): DomCollection;
  append(value: any): DomCollection;
  prepend(value: any): DomCollection;
  empty(): DomCollection;
  clone(): DomCollection;
  remove(): DomCollection;
  show(): DomCollection;
  hide(): DomCollection;
  toggle(): DomCollection;
  parent(): DomCollection;
  find(selector: string): DomCollection;
  closest(selector: string): DomCollection;
  eq(index: number): DomCollection;
  get(index: number): any;
  is(selector: string): boolean;
  blur(): DomCollection;
  animate(props: Record<string, any>, duration?: number): DomCollection;
  click(handler?: (this: HTMLElement, event: any) => any): DomCollection;
  change(handler?: (this: HTMLInputElement, event: any) => any): DomCollection;
  keydown(handler?: (this: HTMLInputElement, event: any) => any): DomCollection;
  on(event: string, handler: (this: HTMLElement, event: any) => any): DomCollection;
  each(handler: (this: any, index?: number, element?: any) => any): DomCollection;
  ready(handler: () => any): DomCollection;
}

export interface DomFacade {
  (selector?: any): DomCollection;
  inArray<T>(value: T, list: ArrayLike<T>): number;
  unique<T>(values: T[]): T[];
  merge<T>(first: T[], second: T[]): T[];
  isEmptyObject(value: object): boolean;
  each<T>(collection: ArrayLike<T> | Record<string, T>, handler: (this: T, key?: any, value?: T) => any): void;
  trim(value: any): string;
}
