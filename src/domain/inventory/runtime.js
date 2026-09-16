// Classic-script inventory boundary for the legacy matcher.
// Storage format intentionally remains: mainType:id,id|mainType:id|
(function (root) {
  'use strict';

  function serialize(mine) {
    var text = '';
    for (var type in mine) {
      text += type + ':' + mine[type].join(',') + '|';
    }
    return text;
  }

  function deserialize(raw) {
    var mine = {};
    var size = 0;
    var sections = raw.split('|');
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].length < 1) continue;
      var section = sections[i].split(':');
      var type = section[0];
      mine[type] = section[1].split(',');
      size += mine[type].length;
    }
    return { mine: mine, size: size };
  }

  function read(storage, readCookie) {
    if (storage) {
      return {
        current: storage.myClothesNew,
        legacy: storage.myClothes
      };
    }
    return {
      current: readCookie('mine2'),
      legacy: readCookie('mine')
    };
  }

  function write(storage, writeCookie, value) {
    if (storage) storage.myClothesNew = value;
    else writeCookie('mine2', value, 3650);
  }

  root.InventoryDomain = Object.freeze({
    serialize: serialize,
    deserialize: deserialize,
    read: read,
    write: write
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
