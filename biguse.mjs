import {
  bootMainMatcher,
  configureRuntimeHooks,
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
import { shoppingCart1, shoppingCart2 } from './biguse_model.mjs';
import { drawTable, initAutoComplete, refreshShoppingCartBiguse } from './biguse_ui.mjs';
import { chooseAccessories, switchCate } from './biguse_nikki.mjs';

const Dom = globalThis.Dom;
const MainActions = globalThis.MainActions;

configureRuntimeHooks({
  drawTable,
  chooseAccessories,
  switchCate,
});

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

function bindCartButtons() {
  const clearA = document.getElementById('btn-clear-cart-a');
  const clearB = document.getElementById('btn-clear-cart-b');
  if (clearA) clearA.addEventListener('click', () => {
    shoppingCart1.clear();
    refreshShoppingCartBiguse();
  });
  if (clearB) clearB.addEventListener('click', () => {
    shoppingCart2.clear();
    refreshShoppingCartBiguse();
  });
}

function bootBigUse() {
  initAutoComplete();
  bootMainMatcher();
  switchCate('妝容');
  bindCartButtons();
}

Dom(document).ready(bootBigUse);

export { bootBigUse };
