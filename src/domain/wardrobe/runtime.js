// Classic-script bridge for legacy browser entry points.
// Keep this shape in lockstep with schema.mjs / adapter.mjs until legacy scripts become ESM.
(function (root) {
  'use strict';

  var fields = Object.freeze([
    'name', 'type', 'id', 'stars', 'gorgeous', 'simple', 'elegant', 'active',
    'mature', 'cute', 'sexy', 'pure', 'cool', 'warm', 'tags', 'source', 'suit', 'version'
  ]);
  var ratings = Object.freeze(fields.slice(4, 14));
  var index = {};
  for (var i = 0; i < fields.length; i++) index[fields[i]] = i;
  Object.freeze(index);

  function rowErrors(row) {
    if (!Array.isArray(row) || row.length !== fields.length) {
      return ['expected ' + fields.length + ' fields, got ' + (Array.isArray(row) ? row.length : typeof row)];
    }
    var errors = [];
    ['name', 'type', 'id'].forEach(function (name) {
      var value = row[index[name]];
      if (typeof value !== 'string' || !value.trim()) {
        errors.push('required ' + name + ' (column ' + index[name] + ') must be a non-empty string');
      }
    });
    return errors;
  }

  function rowToWardrobeItem(row) {
    var errors = rowErrors(row);
    if (errors.length) throw new TypeError(errors.join('; '));
    var item = { ratings: {} };
    for (var i = 0; i < fields.length; i++) {
      var name = fields[i];
      (ratings.indexOf(name) >= 0 ? item.ratings : item)[name] = row[i];
    }
    return item;
  }

  root.WardrobeDomain = Object.freeze({
    fields: fields,
    ratings: ratings,
    fieldIndex: index,
    fieldCount: fields.length,
    rowErrors: rowErrors,
    rowToWardrobeItem: rowToWardrobeItem
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
