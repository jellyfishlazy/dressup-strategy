// Explicit Gate 1 scope; see README.md for exclusions.
export default [{
  files: ['**/*.mjs', 'tool.js'],
  languageOptions: { globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly', URL: 'readonly' } },
  rules: {
    'no-undef': 'error', 'no-global-assign': 'error', 'no-const-assign': 'error',
    'no-dupe-args': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'valid-typeof': 'error',
  },
}, { files: ['tool.js'], languageOptions: { sourceType: 'script' } }];
