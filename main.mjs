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

const Dom = globalThis.Dom;
const MainActions = globalThis.MainActions;

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
