import { createShoppingCart } from './model.mjs';

/** @typedef {import('./src/domain/scoring/types.d.ts').ScoringClothing} ScoringClothing */
/** @typedef {import('./src/domain/shopping-cart/types.d.ts').MatcherShoppingCart<ScoringClothing>} MatcherCart */
/** @type {MatcherCart} */
var shoppingCart1 = createShoppingCart();
/** @type {MatcherCart} */
var shoppingCart2 = createShoppingCart();

export { shoppingCart1, shoppingCart2 };
