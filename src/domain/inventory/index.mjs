// Browser/Node ESM inventory boundary.
// Persisted format intentionally remains: mainType:id,id|mainType:id|

/**
 * @param {import('./types.d.ts').InventoryMine} mine
 * @returns {string}
 */
export function serialize(mine) {
  let text = '';
  for (const type in mine) text += `${type}:${mine[type].join(',')}|`;
  return text;
}

/**
 * @param {string} raw
 * @returns {import('./types.d.ts').InventoryDecoded}
 */
export function deserialize(raw) {
  /** @type {import('./types.d.ts').InventoryMine} */
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

/**
 * @template {import('./types.d.ts').InventoryClothing} T
 * @param {import('./types.d.ts').InventoryOptions<T>} options
 * @returns {import('./types.d.ts').Inventory<T>}
 */
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
      /** @type {Record<string, Record<string, true>>} */
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

/**
 * @param {import('./types.d.ts').InventoryStorage | null | undefined} storage
 * @param {(name: string) => string | undefined} readCookieValue
 * @returns {import('./types.d.ts').InventoryReadResult}
 */
export function read(storage, readCookieValue) {
  if (storage) return { current: storage.myClothesNew, legacy: storage.myClothes };
  return { current: readCookieValue('mine2'), legacy: readCookieValue('mine') };
}

/**
 * @param {import('./types.d.ts').InventoryStorage | null | undefined} storage
 * @param {(name: string, value: string, days: number) => void} writeCookieValue
 * @param {string} value
 */
export function write(storage, writeCookieValue, value) {
  if (storage) storage.myClothesNew = value;
  else writeCookieValue('mine2', value, 3650);
}

/**
 * @param {import('./types.d.ts').CookieDocumentLike | null | undefined} doc
 * @param {string} name
 * @param {(value: string) => string} [decoder]
 * @returns {string}
 */
export function readCookie(doc, name, decoder = value => value) {
  if (!doc?.cookie) return '';
  let start = doc.cookie.indexOf(`${name}=`);
  if (start < 0) return '';
  start += name.length + 1;
  let end = doc.cookie.indexOf(';', start);
  if (end < 0) end = doc.cookie.length;
  return decoder(doc.cookie.substring(start, end));
}

/**
 * @param {import('./types.d.ts').CookieDocumentLike} doc
 * @param {string} name
 * @param {string} value
 * @param {number | null | undefined} expireDays
 * @param {(value: string) => string} [encoder]
 */
export function writeCookie(doc, name, value, expireDays, encoder = input => input) {
  const expires = new Date();
  if (expireDays != null) expires.setDate(expires.getDate() + expireDays);
  doc.cookie = `${name}=${encoder(value)}${expireDays == null ? '' : `; expires=${expires.toUTCString()}`}`;
}

/**
 * @param {import('./types.d.ts').InventoryStorage | null | undefined} storage
 * @param {import('./types.d.ts').CookieDocumentLike} doc
 * @returns {import('./types.d.ts').InventoryReadResult}
 */
export function readBrowser(storage, doc) {
  const decoder = typeof globalThis.unescape === 'function' ? globalThis.unescape : value => value;
  return read(storage, name => readCookie(doc, name, decoder));
}

/**
 * @param {import('./types.d.ts').InventoryStorage | null | undefined} storage
 * @param {import('./types.d.ts').CookieDocumentLike} doc
 * @param {string} value
 */
export function writeBrowser(storage, doc, value) {
  const encoder = typeof globalThis.escape === 'function' ? globalThis.escape : input => input;
  write(storage, (name, cookieValue, days) => writeCookie(doc, name, cookieValue, days, encoder), value);
}
