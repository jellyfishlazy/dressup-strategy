// Incremental legacy coverage. Cross-script globals are explicit per migrated entry point.
const browser = {
  console: 'readonly', document: 'readonly', localStorage: 'readonly', alert: 'readonly',
  unescape: 'readonly', escape: 'readonly', setTimeout: 'readonly', URL: 'readonly', Blob: 'readonly',
  Storage: 'readonly', globalThis: 'readonly',
};
const commonLegacy = {
  ...browser, $: 'readonly', WardrobeDomain: 'readonly', InventoryDomain: 'readonly',
  wardrobe: 'readonly', category: 'readonly', skipCategory: 'readonly', typeInfo: 'readonly',
  Flist: 'readonly', repelCates: 'readonly', pattern: 'readonly', accMul: 'readonly',
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
    files: ['material_model.js'],
    languageOptions: { sourceType: 'script', globals: { ...commonLegacy, pattern_extra: 'readonly', manualScoring: 'readonly' } },
    rules: safetyRules,
  },
  {
    files: ['wardrobechk.js'],
    languageOptions: { sourceType: 'script', globals: { ...browser, WardrobeDomain: 'readonly', InventoryDomain: 'readonly', wardrobe: 'readonly', category: 'readonly' } },
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
      ...browser, $: 'readonly', BigUseDomain: 'readonly', shoppingCart1: 'readonly', shoppingCart2: 'readonly',
      wardrobe2: 'readonly', color: 'readonly', render: 'readonly', td: 'readonly', goTop: 'readonly',
      criteria: 'readonly', byCategoryAndScore: 'readonly', clothes: 'readonly', toggleInventory: 'readonly',
    } },
    rules: safetyRules,
  },
];
