// Browser/Node ESM BigUse domain helpers. DOM-free by design.

/**
 * @template T
 * @param {number} index
 * @param {T} cartA
 * @param {T} cartB
 * @returns {T}
 */
export function cartForIndex(index, cartA, cartB) {
  return index === 1 ? cartA : cartB;
}

/**
 * @param {number} scoreA
 * @param {number} scoreB
 * @returns {import('./types.d.ts').BigUseComparison}
 */
export function compareScores(scoreA, scoreB) {
  const close = scoreA >= scoreB * 0.9 && scoreA <= scoreB * 1.1;
  return {
    scoreA,
    scoreB,
    close,
    winner: close ? null : (scoreA > scoreB ? 'A' : 'B'),
  };
}

/**
 * @param {import('./types.d.ts').BigUsePiece | null | undefined} piece
 * @returns {{ type: string, id: string }}
 */
export function pieceIdentity(piece) {
  if (!piece?.type || !piece.id) return { type: '', id: '' };
  return { type: piece.type.type || '', id: String(piece.id) };
}

/**
 * @param {import('./types.d.ts').BigUsePiece | null | undefined} piece
 * @returns {string}
 */
export function imageLongId(piece) {
  const { type, id } = pieceIdentity(piece);
  if (!type || !id) return '';
  const category = type.split('-')[0];
  if (!category) return '';
  /** @type {Record<string, string>} */
  const imagePrefixes = {
    '髮型': '10', '連身裙': '20', '外套': '30', '上衣': '40', '下著': '50',
    '襪子': '60', '鞋子': '70', '飾品': '80', '妝容': '90', '螢光之靈': '100',
  };
  const prefix = imagePrefixes[category] || '';
  if (!prefix) return '';
  return (id.length > 3 ? prefix.replace('0', '') : prefix) + id;
}

/**
 * @template {{ name?: string }} T
 * @param {T[]} items
 * @param {string} query
 * @returns {Array<import('./types.d.ts').AutocompleteSuggestion<T>>}
 */
export function autocompleteSuggestions(items, query) {
  if (!query) return [];
  /** @type {Array<import('./types.d.ts').AutocompleteSuggestion<T>>} */
  const out = [];
  for (const item of items) {
    if (item && typeof item.name === 'string' && item.name.indexOf(query) >= 0) {
      out.push({ value: item.name, data: item });
    }
  }
  return out;
}
