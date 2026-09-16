// Browser/Node ESM BigUse domain helpers. DOM-free by design.

export function cartForIndex(index, cartA, cartB) {
  return index === 1 ? cartA : cartB;
}

export function compareScores(scoreA, scoreB) {
  const close = scoreA >= scoreB * 0.9 && scoreA <= scoreB * 1.1;
  return {
    scoreA,
    scoreB,
    close,
    winner: close ? null : (scoreA > scoreB ? 'A' : 'B'),
  };
}

export function pieceIdentity(piece) {
  if (!piece?.type || !piece.id) return { type: '', id: '' };
  return { type: piece.type.type || '', id: String(piece.id) };
}

export function imageLongId(piece) {
  const { type, id } = pieceIdentity(piece);
  if (!type || !id) return '';
  const prefix = {
    '髮型': '10', '連身裙': '20', '外套': '30', '上衣': '40', '下著': '50',
    '襪子': '60', '鞋子': '70', '飾品': '80', '妝容': '90', '螢光之靈': '100',
  }[type.split('-')[0]] || '';
  if (!prefix) return '';
  return (id.length > 3 ? prefix.replace('0', '') : prefix) + id;
}

export function autocompleteSuggestions(items, query) {
  if (!query) return [];
  const out = [];
  for (const item of items) {
    if (item && typeof item.name === 'string' && item.name.indexOf(query) >= 0) {
      out.push({ value: item.name, data: item });
    }
  }
  return out;
}
