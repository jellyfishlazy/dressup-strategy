import { rowToWardrobeItem } from './src/domain/wardrobe/index.mjs';
import { createInventory, readBrowser } from './src/domain/inventory/index.mjs';

/** @typedef {{ own: boolean, name: string, type: string, mainType: string, id: string }} WardrobeInventoryClothing */
/** @typedef {import('./src/domain/inventory/types.d.ts').Inventory<WardrobeInventoryClothing>} WardrobeInventory */

const wardrobeRows = globalThis.wardrobe;
const category = globalThis.category;

if (!Array.isArray(wardrobeRows) || !Array.isArray(category)) {
  throw new TypeError('Wardrobe Check requires wardrobe and category data globals');
}

const clothes = wardrobeRows.map(retClothes);

const CATEGORY_HIERARCHY = (() => {
  const ret = {};
  for (const entry of category) {
    const type = entry.split('-')[0];
    if (!ret[type]) ret[type] = [];
    ret[type].push(entry);
  }
  return ret;
})();

/** @returns {WardrobeInventoryClothing} */
function retClothes(csv) {
  const item = rowToWardrobeItem(csv);
  return {
    own: false,
    name: item.name,
    type: item.type,
    mainType: item.type.split('-')[0],
    id: item.id,
  };
}

/** @returns {WardrobeInventory} */
function createWardrobeInventory() {
  return createInventory({
    typeOf: clothing => clothing.mainType,
  });
}

function loadLegacyNames(myClothes) {
  const names = myClothes.split(',');
  for (const clothing of clothes) {
    clothing.own = names.indexOf(clothing.name) >= 0;
  }
  const mine = createWardrobeInventory();
  mine.filter(clothes);
  return mine;
}

function loadSerializedInventory(myClothes) {
  const mine = createWardrobeInventory();
  mine.deserialize(myClothes);
  mine.update(clothes);
  return mine;
}

function loadFromStorage() {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  const stored = readBrowser(storage, document);
  if (stored.current) return loadSerializedInventory(stored.current);
  if (stored.legacy) return loadLegacyNames(stored.legacy);
  return createWardrobeInventory();
}

/** @param {WardrobeInventory} mine */
function updateSize(mine) {
  const textarea = document.getElementById('myClothes');
  if (textarea) textarea.value = mine.serialize();
  const subcount = {};
  for (const type in mine.mine) {
    const mainType = type.split('-')[0];
    if (!subcount[mainType]) subcount[mainType] = 0;
    subcount[mainType] += mine.mine[type].length;
  }
  for (const type in subcount) {
    const tab = document.getElementById(type);
    const badge = tab ? tab.querySelector('a span') : null;
    if (badge) badge.textContent = subcount[type];
  }
}

function drawFilter() {
  let out = "<ul class='nav nav-tabs nav-justified' id='categoryTab'>";
  for (const type in CATEGORY_HIERARCHY) {
    out += '<li id="' + type + '"><a href="#" data-wardrobe-category="' + type + '">' + type + '&nbsp;&nbsp;<span class="badge">0</span></a></li>';
  }
  out += '</ul>';
  const container = document.getElementById('category_container');
  if (!container) return;
  container.innerHTML = out;
  for (const link of container.querySelectorAll('[data-wardrobe-category]')) {
    link.addEventListener('click', event => {
      event.preventDefault();
      switchCate(link.getAttribute('data-wardrobe-category'));
    });
  }
}

function switchCate(categoryName) {
  const searchList = document.getElementById('searchResultList');
  if (searchList) searchList.innerHTML = '';
  const active = document.querySelectorAll('ul#categoryTab li.active, #category_container div.active');
  for (const element of active) element.classList.remove('active');
  const tab = document.getElementById(String(categoryName));
  const categoryPanel = document.getElementById('category-' + categoryName);
  if (tab) tab.classList.add('active');
  if (categoryPanel) categoryPanel.classList.add('active');
  rebuildCate(categoryName);
}

function rebuildCate(categoryName) {
  const owned = [];
  for (const clothing of clothes) {
    if (clothing.mainType !== categoryName || !clothing.own) continue;
    owned.push([clothing.id, clothing.name]);
  }
  owned.sort((a, b) => a[0] - b[0]);

  let leftHtml = '';
  let rightHtml = '';
  for (let index = 0; index < owned.length; index++) {
    const row = owned[index][0] + '&nbsp;' + owned[index][1] + '<br>';
    if (index % 2 > 0) rightHtml += row;
    else leftHtml += row;
  }
  const left = document.getElementById('check_container_left');
  const right = document.getElementById('check_container_right');
  if (left) left.innerHTML = leftHtml;
  if (right) right.innerHTML = rightHtml;
}

function init() {
  const mine = loadFromStorage();
  drawFilter();
  const firstCategory = Object.keys(CATEGORY_HIERARCHY)[0];
  if (firstCategory) switchCate(firstCategory);
  updateSize(mine);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

export {
  CATEGORY_HIERARCHY,
  clothes,
  createWardrobeInventory,
  loadLegacyNames,
  loadSerializedInventory,
  retClothes,
};
