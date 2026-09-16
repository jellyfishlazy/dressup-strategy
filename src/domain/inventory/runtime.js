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

  function createInventory(options) {
    var typeOf = options && options.typeOf;
    if (typeof typeOf !== 'function') throw new TypeError('createInventory requires typeOf(clothing)');
    return {
      mine: {},
      size: 0,
      filter: function (clothes) {
        this.mine = {};
        this.size = 0;
        for (var i = 0; i < clothes.length; i++) {
          if (!clothes[i].own) continue;
          var type = typeOf(clothes[i]);
          if (!this.mine[type]) this.mine[type] = [];
          this.mine[type].push(clothes[i].id);
          this.size++;
        }
      },
      serialize: function () {
        return serialize(this.mine);
      },
      deserialize: function (raw) {
        var decoded = deserialize(raw);
        this.mine = decoded.mine;
        this.size = decoded.size;
      },
      update: function (clothes) {
        var owned = {};
        for (var type in this.mine) {
          owned[type] = {};
          for (var i = 0; i < this.mine[type].length; i++) owned[type][this.mine[type][i]] = true;
        }
        for (var j = 0; j < clothes.length; j++) {
          clothes[j].own = false;
          var clothingType = typeOf(clothes[j]);
          if (owned[clothingType] && owned[clothingType][clothes[j].id]) clothes[j].own = true;
        }
      }
    };
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

  function readCookie(doc, name) {
    if (!doc || !doc.cookie || doc.cookie.length < 1) return '';
    var start = doc.cookie.indexOf(name + '=');
    if (start < 0) return '';
    start += name.length + 1;
    var end = doc.cookie.indexOf(';', start);
    if (end < 0) end = doc.cookie.length;
    var decoder = typeof root.unescape === 'function' ? root.unescape : function (value) { return value; };
    return decoder(doc.cookie.substring(start, end));
  }

  function writeCookie(doc, name, value, expireDays) {
    var expires = new Date();
    expires.setDate(expires.getDate() + expireDays);
    var encoder = typeof root.escape === 'function' ? root.escape : function (input) { return input; };
    doc.cookie = name + '=' + encoder(value) + (expireDays == null ? '' : '; expires=' + expires.toGMTString());
  }

  function readBrowser(storage, doc) {
    return read(storage, function (name) { return readCookie(doc, name); });
  }

  function writeBrowser(storage, doc, value) {
    write(storage, function (name, cookieValue, days) { writeCookie(doc, name, cookieValue, days); }, value);
  }

  root.InventoryDomain = Object.freeze({
    serialize: serialize,
    deserialize: deserialize,
    createInventory: createInventory,
    read: read,
    write: write,
    readBrowser: readBrowser,
    writeBrowser: writeBrowser
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
