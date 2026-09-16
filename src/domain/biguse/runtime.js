// Classic-script BigUse domain helpers. Keep DOM/jQuery out of this layer.
(function (root) {
  'use strict';

  function cartForIndex(index, cartA, cartB) {
    return index === 1 ? cartA : cartB;
  }

  function compareScores(scoreA, scoreB) {
    var close = scoreA >= scoreB * 0.9 && scoreA <= scoreB * 1.1;
    return {
      scoreA: scoreA,
      scoreB: scoreB,
      close: close,
      winner: close ? null : (scoreA > scoreB ? 'A' : 'B')
    };
  }

  function pieceIdentity(piece) {
    if (!piece || !piece.type || !piece.id) return { type: '', id: '' };
    return { type: piece.type.type || '', id: String(piece.id) };
  }

  function imageLongId(piece) {
    var identity = pieceIdentity(piece);
    var type = identity.type;
    var id = identity.id;
    if (!type || !id) return '';
    var base = type.split('-')[0];
    var prefix = {
      '髮型': '10', '連身裙': '20', '外套': '30', '上衣': '40', '下著': '50',
      '襪子': '60', '鞋子': '70', '飾品': '80', '妝容': '90', '螢光之靈': '100'
    }[base] || '';
    if (!prefix) return '';
    return (id.length > 3 ? prefix.replace('0', '') : prefix) + id;
  }

  function autocompleteSuggestions(items, query) {
    if (!query) return [];
    var out = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i] && typeof items[i].name === 'string' && items[i].name.indexOf(query) >= 0) {
        out.push({ value: items[i].name, data: items[i] });
      }
    }
    return out;
  }

  root.BigUseDomain = Object.freeze({
    cartForIndex: cartForIndex,
    compareScores: compareScores,
    pieceIdentity: pieceIdentity,
    imageLongId: imageLongId,
    autocompleteSuggestions: autocompleteSuggestions
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
