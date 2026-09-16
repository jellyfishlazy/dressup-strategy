// Incremental legacy coverage. Browser-native ESM runtimes use explicit module imports.
const browser = {
  console: 'readonly', document: 'readonly', localStorage: 'readonly', alert: 'readonly', confirm: 'readonly',
  unescape: 'readonly', escape: 'readonly', setTimeout: 'readonly', URL: 'readonly', Blob: 'readonly',
  Storage: 'readonly', globalThis: 'readonly', window: 'readonly', getComputedStyle: 'readonly',
  setInterval: 'readonly', FileReader: 'readonly', location: 'readonly',
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
    files: [
      'main.mjs', 'model.mjs', 'ui.mjs', 'nikki.mjs', 'onekeystrategy.mjs', 'onekeystrategy_lan.mjs',
      'sharewardrobe.mjs', 'clock.mjs', 'biguse.mjs', 'biguse_model.mjs', 'biguse_ui.mjs', 'biguse_nikki.mjs',
      'material_model.mjs', 'material.mjs', 'wardrobechk.mjs',
    ],
    languageOptions: { globals: browser },
    rules: safetyRules,
  },
  {
    files: ['wardrobechk.mjs'],
    languageOptions: { globals: { ...browser, CSS: 'readonly' } },
    rules: safetyRules,
  },
];
