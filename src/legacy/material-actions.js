// Delegated action binding for legacy Material markup. Keeps generated HTML free of inline handlers.
(function (root) {
  'use strict';

  function parseArgs(source) {
    var text = String(source || '').trim();
    if (!text) return [];
    var out = [];
    var current = '';
    var quote = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (quote) {
        if (ch === quote && text.charAt(i - 1) !== '\\') quote = '';
        else current += ch;
      } else if (ch === '\'' || ch === '"') {
        quote = ch;
      } else if (ch === ',') {
        out.push(coerce(current));
        current = '';
      } else {
        current += ch;
      }
    }
    out.push(coerce(current));
    return out;
  }

  function coerce(value) {
    var text = String(value || '').trim();
    if (text === '') return '';
    if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (text === 'null') return null;
    return text;
  }

  function run(encoded) {
    var action = decodeURIComponent(String(encoded || '')).trim();
    if (!action) return;
    var match = /^([A-Za-z_$][\w$]*)\s*\((.*)\)\s*$/.exec(action);
    if (!match) throw new Error('Invalid material action: ' + action);
    var fn = root[match[1]];
    if (typeof fn !== 'function') throw new Error('Unknown material action: ' + match[1]);
    return fn.apply(root, parseArgs(match[2]));
  }

  function bind() {
    document.addEventListener('click', function (event) {
      var target = event.target.closest && event.target.closest('[data-material-action]');
      if (!target) return;
      event.preventDefault();
      run(target.getAttribute('data-material-action'));
    });
    document.addEventListener('change', function (event) {
      var target = event.target.closest && event.target.closest('[data-material-change]');
      if (!target) return;
      run(target.getAttribute('data-material-change'));
    });
  }

  root.MaterialActions = Object.freeze({ run: run, parseArgs: parseArgs });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})(typeof globalThis !== 'undefined' ? globalThis : this);
