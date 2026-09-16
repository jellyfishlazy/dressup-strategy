// Incremental legacy coverage. Cross-script globals are explicit per migrated entry point.
const browser = {
  console: 'readonly', document: 'readonly', localStorage: 'readonly', alert: 'readonly', confirm: 'readonly',
  unescape: 'readonly', escape: 'readonly', setTimeout: 'readonly', URL: 'readonly', Blob: 'readonly',
  Storage: 'readonly', globalThis: 'readonly', window: 'readonly', getComputedStyle: 'readonly',
  setInterval: 'readonly', FileReader: 'readonly', location: 'readonly',
};
const commonLegacy = {
  ...browser, Dom: 'readonly', WardrobeDomain: 'readonly', InventoryDomain: 'readonly',
  wardrobe: 'readonly', category: 'readonly', skipCategory: 'readonly', typeInfo: 'readonly',
  Flist: 'readonly', repelCates: 'readonly', pattern: 'readonly', accMul: 'readonly',
};

const mainRuntimeGlobals = {
  ...browser, Dom: 'readonly', category: 'readonly', shoppingCart: 'readonly', clothesSet: 'readonly',
  FEATURES: 'readonly', global: 'readonly', replaceScoreBonusFactory: 'readonly', addScoreBonusFactory: 'readonly',
  drawTable: 'readonly', clone: 'readonly', accSumScore: 'readonly', accCateNum: 'readonly', skipCategory: 'readonly',
  clothes: 'readonly', loadNew: 'readonly', load: 'readonly', ReDrawcloneHeaderRow: 'readonly', allThemes: 'readonly',
  themeFilter: 'readonly', scoring: 'readonly', save: 'readonly', MyClothes: 'readonly', button_search: 'readonly',
  clothesNameTd_Search: 'readonly', loadFromStorage: 'readonly', clothesHistoryNotice: 'readonly', levelHistoryNotice: 'readonly',
  shareWardrobe: 'readonly', menuFixed: 'readonly', initOnekey: 'readonly', calcDependencies: 'readonly',
  clothesNotice: 'readonly', levelNotice: 'readonly', lastVersion: 'readonly', CATEGORY_HIERARCHY: 'readonly',
  criteria: 'writable', repelCates: 'readonly', Flist: 'readonly', p: 'readonly', pspan: 'readonly',
  getStrCriteria: 'readonly', getstrTag: 'readonly', matches: 'readonly', lanStrategy: 'readonly', uiFilter: 'writable',
  WardrobeDomain: 'readonly', InventoryDomain: 'readonly', typeInfo: 'readonly', accMul: 'readonly', pattern: 'readonly',
  render: 'readonly', td: 'readonly', goTop: 'readonly', refreshShoppingCart: 'readonly', toggleInventory: 'readonly',
};

const safetyRules = {
  'no-undef': 'error', 'no-global-assign': 'error', 'no-const-assign': 'error',
  'no-dupe-args': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'valid-typeof': 'error',
};

export default [
  {
    files: ['**/*.mjs', 'tool.js', 'src/domain/**/*.js'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly', URL: 'readonly' } },
    rules: safetyRules,
  },
  { files: ['tool.js', 'src/domain/**/*.js'], languageOptions: { sourceType: 'script' } },
  {
    files: ['src/legacy/**/*.js'],
    languageOptions: { sourceType: 'script', globals: browser },
    rules: safetyRules,
  },
  {
    files: ['model.js'],
    languageOptions: { sourceType: 'script', globals: commonLegacy },
    rules: safetyRules,
  },
  {
    files: ['material_model.mjs', 'material.mjs'],
    languageOptions: { globals: browser },
    rules: safetyRules,
  },
  {
    files: ['wardrobechk.mjs'],
    languageOptions: { globals: { ...browser, CSS: 'readonly' } },
    rules: safetyRules,
  },
  {
    files: ['ui.js', 'nikki.js', 'onekeystrategy.js', 'onekeystrategy_lan.js', 'clock.js', 'sharewardrobe.js'],
    languageOptions: { sourceType: 'script', globals: mainRuntimeGlobals },
    rules: safetyRules,
  },
  {
    files: ['biguse_model.js'],
    languageOptions: { sourceType: 'script', globals: { createShoppingCart: 'readonly' } },
    rules: safetyRules,
  },
  {
    files: ['biguse_ui.js'],
    languageOptions: { sourceType: 'script', globals: {
      ...browser, Dom: 'readonly', NativeAutocomplete: 'readonly', BigUseDomain: 'readonly', shoppingCart1: 'readonly', shoppingCart2: 'readonly',
      wardrobe2: 'readonly', color: 'readonly', render: 'readonly', td: 'readonly', goTop: 'readonly',
      criteria: 'readonly', byCategoryAndScore: 'readonly', clothes: 'readonly', toggleInventory: 'readonly',
    } },
    rules: safetyRules,
  },
  {
    files: ['biguse_nikki.js'],
    languageOptions: { sourceType: 'script', globals: {
      ...browser, Dom: 'readonly', currentCategory: 'writable', onChangeUiFilter: 'readonly',
      refreshShoppingCartBiguse: 'readonly', color: 'readonly',
    } },
    rules: safetyRules,
  },
];
