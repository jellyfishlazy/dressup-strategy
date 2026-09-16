import './clock.mjs';
import {
  bootMainMatcher,
  reDrawTheme,
  changeTheme,
  changeFilter,
  clearImport,
  doImport,
  loadCustomInventory,
  toggleSearchResult,
  searchResult,
  clearShoppingCart,
  saveTextAsFile,
  loadFileAsText,
} from './nikki.mjs';
import { getWardrobe } from './sharewardrobe.mjs';

/** @type {import('./src/legacy/native-dom-types.d.ts').DomFacade} */
const Dom = /** @type {typeof globalThis & { Dom: import('./src/legacy/native-dom-types.d.ts').DomFacade }} */ (globalThis).Dom;
const MainActions = /** @type {typeof globalThis & { MainActions: { register(actions: Record<string, (...args: never[]) => unknown>): void } }} */ (globalThis).MainActions;

MainActions.register({
  reDrawTheme,
  changeTheme,
  changeFilter,
  clearImport,
  doImport,
  loadCustomInventory,
  toggleSearchResult,
  searchResult,
  clearShoppingCart,
  saveTextAsFile,
  loadFileAsText,
  getWardrobe,
});

Dom(document).ready(bootMainMatcher);
