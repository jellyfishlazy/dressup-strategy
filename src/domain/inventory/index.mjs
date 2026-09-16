// Browser/Node ESM inventory boundary.
// Persisted format intentionally remains: mainType:id,id|mainType:id|

export function serialize(mine) {
  let text = '';
  for (const type in mine) text += `${type}:${mine[type].join(',')}|`;
  return text;
}

export function deserialize(raw) {
  const mine = {};
  let size = 0;
  for (const part of String(raw).split('|')) {
    if (!part) continue;
    const section = part.split(':');
    const type = section[0];
    mine[type] = section[1].split(',');
    size += mine[type].length;
  }
  return { mine, size };
}

export function createInventory(options) {
  const typeOf = options?.typeOf;
  if (typeof typeOf !== 'function') throw new TypeError('createInventory requires typeOf(clothing)');

  return {
    mine: {},
    size: 0,
    filter(clothes) {
      this.mine = {};
      this.size = 0;
      for (const clothing of clothes) {
        if (!clothing.own) continue;
        const type = typeOf(clothing);
        if (!this.mine[type]) this.mine[type] = [];
        this.mine[type].push(clothing.id);
        this.size++;
      }
    },
    serialize() {
      return serialize(this.mine);
    },
    deserialize(raw) {
      const decoded = deserialize(raw);
      this.mine = decoded.mine;
      this.size = decoded.size;
    },
    update(clothes) {
      const owned = {};
      for (const type in this.mine) {
        owned[type] = {};
        for (const id of this.mine[type]) owned[type][id] = true;
      }
      for (const clothing of clothes) {
        clothing.own = false;
        const type = typeOf(clothing);
        if (owned[type]?.[clothing.id]) clothing.own = true;
      }
    },
  };
}

export function read(storage, readCookie) {
  if (storage) return { current: storage.myClothesNew, legacy: storage.myClothes };
  return { current: readCookie('mine2'), legacy: readCookie('mine') };
}

export function write(storage, writeCookie, value) {
  if (storage) storage.myClothesNew = value;
  else writeCookie('mine2', value, 3650);
}

export function readCookie(doc, name, decoder = value => value) {
  if (!doc?.cookie) return '';
  let start = doc.cookie.indexOf(`${name}=`);
  if (start < 0) return '';
  start += name.length + 1;
  let end = doc.cookie.indexOf(';', start);
  if (end < 0) end = doc.cookie.length;
  return decoder(doc.cookie.substring(start, end));
}

export function writeCookie(doc, name, value, expireDays, encoder = input => input) {
  const expires = new Date();
  expires.setDate(expires.getDate() + expireDays);
  doc.cookie = `${name}=${encoder(value)}${expireDays == null ? '' : `; expires=${expires.toGMTString()}`}`;
}

export function readBrowser(storage, doc) {
  const decoder = typeof globalThis.unescape === 'function' ? globalThis.unescape : value => value;
  return read(storage, name => readCookie(doc, name, decoder));
}

export function writeBrowser(storage, doc, value) {
  const encoder = typeof globalThis.escape === 'function' ? globalThis.escape : input => input;
  write(storage, (name, cookieValue, days) => writeCookie(doc, name, cookieValue, days, encoder), value);
}
