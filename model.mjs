import { rowToWardrobeItem } from './src/domain/wardrobe/index.mjs';
import { createInventory, readBrowser, writeBrowser } from './src/domain/inventory/index.mjs';

/** @type {import('./src/legacy/native-dom-types.d.ts').DomFacade} */
const Dom = /** @type {typeof globalThis & { Dom: import('./src/legacy/native-dom-types.d.ts').DomFacade }} */ (globalThis).Dom;
const wardrobe = /** @type {typeof globalThis & { wardrobe: import('./src/domain/wardrobe/types.d.ts').WardrobeRow[] }} */ (globalThis).wardrobe;
const category = /** @type {typeof globalThis & { category: string[] }} */ (globalThis).category;
const skipCategory = /** @type {typeof globalThis & { skipCategory: string[] }} */ (globalThis).skipCategory;
const typeInfo = /** @type {typeof globalThis & { typeInfo: Record<string, ClothesType> }} */ (globalThis).typeInfo;
const Flist = /** @type {typeof globalThis & { Flist: Record<string, { type: string[], tag?: string[], [id: string]: string | string[] | undefined }> }} */ (globalThis).Flist;
const repelCates = /** @type {typeof globalThis & { repelCates: string[][] }} */ (globalThis).repelCates;
const pattern = /** @type {typeof globalThis & { pattern: [string, string, string, string, number, string][] }} */ (globalThis).pattern;
// Ivan's Workshop
/** @typedef {import('./src/domain/scoring/types.d.ts').FeatureName} FeatureName */
/** @typedef {import('./src/domain/scoring/types.d.ts').ClothesType} ClothesType */
/** @typedef {import('./src/domain/scoring/types.d.ts').RatingTuple} RatingTuple */
/** @typedef {import('./src/domain/scoring/types.d.ts').ScoreByCategoryState} ScoreByCategoryState */
/** @typedef {import('./src/domain/scoring/types.d.ts').ScoringGlobalState} ScoringGlobalState */
/** @typedef {import('./src/domain/scoring/types.d.ts').ClothingDependency} ClothingDependency */
/** @typedef {import('./src/domain/scoring/types.d.ts').ScoringClothing} ScoringClothing */
/** @typedef {ScoringClothing & { isSuit: string }} ModelClothing */
/** @typedef {import('./src/domain/inventory/types.d.ts').Inventory<ScoringClothing>} ClothesInventory */
/** @typedef {import('./src/domain/shopping-cart/types.d.ts').MatcherShoppingCart<ScoringClothing>} MatcherCart */
/** @type {FeatureName[]} */
var FEATURES = ["simple", "cute", "active", "pure", "cool"];
/** @type {Record<string, [FeatureName, import('./src/domain/scoring/types.d.ts').FeatureSign]>} */
var CHINESE_TO_FEATURES = {
	"簡約":["simple","+"],
	"華麗":["simple","-"],
	"可愛":["cute","+"],
	"成熟":["cute","-"],
	"活潑":["active","+"],
	"優雅":["active","-"],
	"清純":["pure","+"],
	"性感":["pure","-"],
	"清涼":["cool","+"],
	"保暖":["cool","-"]
};
var ACCRATIO = [1, 1, 1, 1, 0.95, 0.9, 0.825, 0.75, 0.7, 0.65, 0.6, 0.55, 0.51, 0.47, 0.45, 0.425, 0.4];

/** @type {ScoringGlobalState} */
var global = {
  float: null,
  additionalBonus: null
};

/** @param {string | number} arg1 @param {string | number} arg2 */
function accMul(arg1, arg2) {
	var m = 0,
	s1 = arg1.toString(),
	s2 = arg2.toString();
	try {
		m += (s1.split(".")[1] ?? "").length
	} catch (e) {}
	try {
		m += (s2.split(".")[1] ?? "").length
	} catch (e) {}
	return Number(s1.replace(".", "")) * Number(s2.replace(".", "")) / Math.pow(10, m)
}

// parses a csv row into object
// Clothes: name, type, id, stars, gorgeous, simple, elegant, active, mature, cute, sexy, pure, cool, warm，extra
//          0     1     2   3      4         5       6        7       8       9     10    11    12    13    14
/**
 * @param {import('./src/domain/wardrobe/types.d.ts').WardrobeRow} csv
 * @returns {ModelClothing}
 */
var Clothes = function(csv) {
  var item = rowToWardrobeItem(csv);
  var theType = /** @type {ClothesType} */ (typeInfo[item.type]);
  if(!theType)
	  console.log(csv);
  return {
    own: false,
    name: item.name,
    type: theType,
    id: item.id,
	longid: clotonum(item.type,item.id),
    stars: item.stars,
    simple: realRating(item.ratings.simple, item.ratings.gorgeous, theType),
    cute: realRating(item.ratings.cute, item.ratings.mature, theType),
    active: realRating(item.ratings.active, item.ratings.elegant, theType),
    pure: realRating(item.ratings.pure, item.ratings.sexy, theType),
    cool: realRating(item.ratings.cool, item.ratings.warm, theType),
    // Split on '/', ',' and full-width '，' so 'POP/小動物' becomes two tokens
    // that levelBonus / Flist tag whitelists can match individually.
    tags: item.tags.split(/[\/,，]/).map(function (/** @type {string} */ value) { return value.trim(); }).filter(Boolean),
    tagsRaw: item.tags,
    source: item.source.replace(/抽·/g,"").replace(/設·/g,"").replace(/設·圖/g,"設計圖"),
	isSuit: /** @type {string} */ (item.suit),
	version: item.version,
    deps: /** @type {ClothingDependency[]} */ ([]),
    toCsv: function() {
      var name = this.name;
      var type = this.type;
      var id = this.id;
      var stars = this.stars;
      var simple = this.simple;
      var cute = this.cute;
      var active = this.active;
      var pure = this.pure;
      var cool = this.cool;
      var extra = this.tagsRaw != null ? this.tagsRaw : this.tags.join(',');
      var source = this.source;
	  var isSuit = this.isSuit;
	  var version = this.version;
      return [type.type, id, stars, simple[0], simple[1], cute[0], cute[1],
          active[0], active[1], pure[0], pure[1], cool[0],
          cool[1], extra, source, isSuit, version];
    },
    addDep: function(sourceType, depNum, c) {
		/** @type {ClothingDependency} */
		var depinfo = { sourceType, depNum, c };
      if (c == this) {
        alert("Self reference: " + this.type.type + " " + this.id + " " + this.name);
      }
      this.deps.push(depinfo);
    },
    getDeps: function(indent, parentDepNum) {
      var ret = '';
        for (const depinfo of this.deps) {
		  var c = depinfo.c;
		  var depNumAll = 1;
		  if(depinfo.sourceType != "染"){
			depNumAll = parentDepNum * depinfo.depNum - parentDepNum;
		  }
		  else{
			 depNumAll = parentDepNum;
		  }
          ret += indent + '[' + depinfo.sourceType + '][' + c.type.mainType + ']'
              + c.name + ((c.own || depNumAll == 0)? '' : '[需' + (depNumAll)  + ']')+ '\n';
          ret += c.getDeps(indent + "   ", depNumAll);
        }
		/*var splits = ret.split(/[^0-9]+/);
		splits = splits.splice(1,splits.length-2);
		splits.push(0);
		var depNumAlls = 0;
		if(splits.length > 1)
			depNumAlls = eval(splits.join("+"));
		*/
		//rean - may miscalc when numbers in clothes name
		var splits1=ret.split('[');
		var splits2='';
		for (const splitPart of splits1.slice(1)){
			splits2 += splitPart.split(']')[0];
		}
		//get text in [] and join tgt
		var splits = splits2.split(/[^0-9]+/);
		//split by and keep numbers
		var depNumAlls = 0;
		if (splits.length > 1) for (const splitPart of splits) if(splitPart) depNumAlls += Number(splitPart);

		if(indent == '   ' && ret != '')
			ret = "[材料]" + this.name + (depNumAlls > 0 ?  ' - 總計需 '+ depNumAlls + ' 件' : '') + "\n" + ret;
      return ret;
    },
    calc: function(filters) {
      var isf = 1 ;
      var levelRules = Flist && filters.levelName !== undefined ? Flist[filters.levelName] : undefined;
      if(levelRules){
        if (levelRules[this.longid]){
          if (levelRules[this.longid] == "F"){
            isf = 0.1; //in blacklist
          }
        }else if(Dom.inArray(this.type.type, levelRules["type"])>-1){
            //not in whitelist, check whether in tag list
            if(!levelRules["tag"]) isf = 0.1;
            else if(!this.tags) isf = 0.1;
            else{
              var isf_tag=0;
              for(var t in this.tags){
                if(Dom.inArray(this.tags[t], levelRules["tag"])>-1){
                  isf_tag=1; break;
                }
              }
              if(!isf_tag) isf = 0.1;
          }
        }
      }
      var s = 0;
      var self = this;
      this.tmpScoreByCategory = ScoreByCategory();
      this.bonusByCategory = ScoreByCategory();
      for (const f of FEATURES) {
        var weight = filters[f];
        if (weight) {
          var sub = weight * self[f][2] * isf;
		  //螢光之靈
		  if(this.type && "螢光之靈" == this.type.type && this.tags != null){
			var lights = /** @type {string} */ (this.tags[0]).split("+");
			var lightFilter = /** @type {[FeatureName, import('./src/domain/scoring/types.d.ts').FeatureSign]} */ (CHINESE_TO_FEATURES[/** @type {string} */ (lights[0])]);
			var lightScore = Number(lights[1]);
			if(f == lightFilter[0]){
				if(filters.highscore1==f) lightScore=accMul(lightScore, 1.27);
				if(filters.highscore2==f) lightScore=accMul(lightScore, 1.778);
				if(0 > weight && "-" == lightFilter[1]){
					sub += lightScore * 1;
				}
				else if(0 < weight && "+" == lightFilter[1]){
					sub += lightScore * 1;
				}
			}
		  }
          if (weight > 0) {
            if (sub > 0) {
              this.tmpScoreByCategory.record(f, sub, 0); // matched with major
            } else {
              this.tmpScoreByCategory.record(f, 0, sub); // mismatch with minor
            }
          } else {
            if (sub > 0) {
              this.tmpScoreByCategory.record(f, 0, sub); // matched with minor
            } else {
              this.tmpScoreByCategory.record(f, sub, 0); // mismatch with major
            }

          }
          if (sub > 0) {
            s += sub;
          }
        }
      }

      this.isF = (isf==1? 0:1);
      this.tmpScore = Math.round(s);
      this.bonusScore = 0;
	  this.sumScore = 0;
      var total = 0;
      if (filters.bonus) {
        for (var i in filters.bonus) {
          var bonus = filters.bonus[i];
          if (!bonus) continue;
          var resultlist = bonus.filter(this);
          var result = resultlist[0];
          if (result > 0) {
            // result > 0 means match
            this.bonusByCategory.addRaw(filters, resultlist[1]);
            total += result;
            if (bonus.replace) {
              this.tmpScore /= 10;
              this.tmpScoreByCategory.f();
            }
          }
        }
        this.bonusScore = Math.round(Number(total.toFixed(0)) * isf);
      }


      this.tmpScore = Math.round(this.tmpScore);
	  this.sumScore = this.tmpScore + this.bonusScore ;
    }
  };
}

/** @param {string} type @param {string} id */
function clotonum(type,id){
	var mainType='';
	switch(type.split('-')[0]){
		case '髮型': mainType='1'; break;
		case '連身裙': mainType='2'; break;
		case '外套': mainType='3'; break;
		case '上衣': mainType='4'; break;
		case '下著': mainType='5'; break;
		case '襪子': mainType='6'; break;
		case '鞋子': mainType='7'; break;
		case '飾品': mainType='8'; break;
		case '妝容': mainType='9'; break;
		case '螢光之靈': mainType='A'; break;
	}
	if (parseInt(id) >= 1000) return mainType + id;
	else return mainType + '0' + id;
}

/** @returns {ScoreByCategoryState} */
function ScoreByCategory() {
  /** @type {import('./src/domain/scoring/types.d.ts').ScoreMap} */
  var initial = /** @type {import('./src/domain/scoring/types.d.ts').ScoreMap} */ ({});
  for (const feature of FEATURES) {
    initial[feature] = [0, 0];
  }
  return {
    scores: initial,
    // score: positive - matched, negative - no matched
    record: function(category, major, minor) {
      this.scores[category] = [major, minor];
    },
    add: function(other) {
      for (var key in other.scores) {
        var c = /** @type {FeatureName} */ (key);
        this.scores[c][0] += other.scores[c][0];
        this.scores[c][1] += other.scores[c][1];
      }
    },
    round: function() {
      for (var key in this.scores) {
        var c = /** @type {FeatureName} */ (key);
        this.scores[c][0] = Math.round(this.scores[c][0]);
        this.scores[c][1] = Math.round(this.scores[c][1]);
      }
    },
    addRaw: function(filters, rawdata) {
      for (const f of FEATURES) {
        var weight = filters[f] || 0;
        var rawScore = rawdata[f] || 0;
        if (weight && rawScore > 0) {
          if (weight > 0) { // level requires major
            this.scores[f][0] += rawScore;
          } else { // level requires minor
            this.scores[f][1] += rawScore;
          }
        }
      }
    },
    f: function() {
      for (var key in this.scores) {
        var c = /** @type {FeatureName} */ (key);
        this.scores[c][0] /= 10;
        this.scores[c][1] /= 10;
      }
    }
  };
}

/** @returns {ClothesInventory} */
function MyClothes() {
  return createInventory({
    typeOf: function (clothing) { return clothing.type.mainType; }
  });
}

var typedClothes = function() {
  /** @type {ModelClothing[]} */
  var ret = [];
  for (var i in wardrobe) {
//console.log(wardrobe[i]);
    var row = wardrobe[i];
    if (row) ret.push(Clothes(row));
  }
  return ret;
}();

var typedClothesSet = function() {
  /** @type {Record<string, Record<string, ModelClothing>>} */
  var ret = {};
  for (var i in typedClothes) {
    var clothing = typedClothes[i];
    if (!clothing) continue;
    var t = clothing.type.mainType;
    if (!ret[t]) {
      ret[t] = {};
    }
    var group = ret[t];
    if (group) group[clothing.id] = clothing;
  }
  return ret;
}();

/** @type {ModelClothing[]} */
var clothes = typedClothes;
/** @type {Record<string, Record<string, ModelClothing>>} */
var clothesSet = typedClothesSet;

/** @returns {MatcherCart} */
function createShoppingCart() {
  /** @type {Record<string, ScoringClothing>} */
  var cart = {};
  return {
  cart: cart,
  totalScore: fakeClothes(cart),
  clear: function() {
    this.cart = {};
  },
  contains: function(c) {
    return this.cart[c.type.type] == c;
  },
  remove: function(c) {
    delete this.cart[c];
  },
  putAll: function(clothes) {
    for (const clothing of Object.values(clothes)) {
      this.put(clothing);
    }
  },
  put: function(c) {
    this.cart[c.type.type] = c;
  },
  toList: function(sortBy) {
    var ret = [];
    for (const clothing of Object.values(this.cart)) {
      ret.push(clothing);
    }
    return ret.sort(sortBy);
  },
  calc: function(criteria) {
    for (const clothing of Object.values(this.cart)) {
      clothing.calc(criteria);
    }
    // fake a clothes
    this.totalScore = fakeClothes(this.cart);
  },
  validate: function(criteria,accNum){ //accNum is the number of accessories kept finally
	for (var i in repelCates){ //remove repelCates
		var repelGroup = repelCates[i];
		if (!repelGroup) continue;
		var sumFirst = 0;
		var sumOthers = 0;
		for (var j in repelGroup){
			var currCate=repelGroup[j];
			if (!currCate) continue;
			var cartItem = this.cart[currCate];
			if (cartItem) {
				cartItem.calc(criteria);
				var currSumScore = currCate.split('-')[0] == '飾品' ? accSumScore(cartItem, accNum?accNum:accCateNum) : /** @type {number} */ (cartItem.sumScore);
				if (Number(j) > 0) sumOthers+=currSumScore;
				else sumFirst+=currSumScore;
			}
		}
		if (sumOthers > sumFirst) {
			var firstCate = repelGroup[0];
			if (firstCate) this.remove(firstCate);
		}else{
			for (var j in repelGroup){
				var removeCate = repelGroup[j];
				if (Number(j) > 0 && removeCate) this.remove(removeCate);
			}
		}
	}
	if (accNum) {//keep accessories base on accNum
		/** @type {[string, number][]} */
		var sortCates=[];
		for (var i in category){
			var currCate=category[i];
			if (!currCate) continue;
			var cartItem = this.cart[currCate];
			if (currCate.split('-')[0] == '飾品' && cartItem) {
				sortCates.push([currCate, accSumScore(cartItem, accNum)]);
			}
		}
		if (sortCates.length > accNum) {
			sortCates.sort(function(a,b){return b[1] - a[1]});
			sortCates = sortCates.slice(accNum);
			for (const [categoryName] of sortCates) this.remove(categoryName);
		}
	}
  }
};

}

var shoppingCart = createShoppingCart();

/** @param {number} total @param {number} items */
function accScore(total, items) {
  if (items < ACCRATIO.length) {
    return total * (ACCRATIO[items] ?? 0.4);
  }
  return total * 0.4;
}

/** @param {Pick<ScoringClothing, 'tmpScore' | 'bonusScore'>} a @param {number} items */
function accSumScore(a,items){
	return accScore(/** @type {number} */ (a.tmpScore), items)+/** @type {number} */ (a.bonusScore);
}

var accCateNum = function() {
	var cnt = 0;
	for (var i in category) {
		if (category[i]?.split('-')[0] == "飾品") cnt++;
	}
	for (var i in skipCategory) {
		if (skipCategory[i]?.split('-')[0] == "飾品") cnt--;
	}
	return cnt;
}();

/**
 * @param {import('./src/domain/shopping-cart/types.d.ts').ShoppingCartMap<ScoringClothing>} cart
 * @returns {import('./src/domain/shopping-cart/types.d.ts').ShoppingCartTotal}
 */
function fakeClothes(cart) {
  var totalScore = 0;
  var totalAccessories = 0;
  var totalScoreByCategory = ScoreByCategory();
  var totalBonusByCategory = ScoreByCategory();
  var totalAccessoriesByCategory = ScoreByCategory();
  var totalAccessoriesBonusByCategory = ScoreByCategory();
  var numAccessories = 0;
  for (var c in cart) {
    // Cart totals consume clothing after calc() has populated its score state.
    var clothing = /** @type {Required<ScoringClothing>} */ (cart[c]);
    if (c.split('-')[0] == "飾品") {
      totalAccessories += clothing.tmpScore;
      totalScore += clothing.bonusScore;
      totalAccessoriesByCategory.add(clothing.tmpScoreByCategory);
      totalAccessoriesBonusByCategory.add(clothing.bonusByCategory);
      numAccessories ++;
    } else {
      totalScore += clothing.sumScore;
      totalScoreByCategory.add(clothing.tmpScoreByCategory);
      totalBonusByCategory.add(clothing.bonusByCategory);
    }
  }
  totalScore += accScore(totalAccessories, numAccessories);
  for (var key in totalAccessoriesByCategory.scores) {
    const c = /** @type {FeatureName} */ (key);
    totalAccessoriesByCategory.scores[c][0] = accScore(totalAccessoriesByCategory.scores[c][0],
        numAccessories);
    totalAccessoriesByCategory.scores[c][1] = accScore(totalAccessoriesByCategory.scores[c][1],
        numAccessories);
  }
  totalScoreByCategory.add(totalAccessoriesByCategory);
  totalBonusByCategory.add(totalAccessoriesBonusByCategory);
  totalScoreByCategory.round();
  totalBonusByCategory.round();

  var scores = totalScoreByCategory.scores;
  var bonus = totalBonusByCategory.scores;
  return {
    name: '總分',
    sumScore: Math.round(totalScore),
    toCsv: function() {
      return ['', '', '',
          scoreWithBonusTd(scores.simple[0], bonus.simple[0]),
          scoreWithBonusTd(scores.simple[1], bonus.simple[1]),
          scoreWithBonusTd(scores.cute[0], bonus.cute[0]),
          scoreWithBonusTd(scores.cute[1], bonus.cute[1]),
          scoreWithBonusTd(scores.active[0], bonus.active[0]),
          scoreWithBonusTd(scores.active[1], bonus.active[1]),
          scoreWithBonusTd(scores.pure[0], bonus.pure[0]),
          scoreWithBonusTd(scores.pure[1], bonus.pure[1]),
          scoreWithBonusTd(scores.cool[0], bonus.cool[0]),
          scoreWithBonusTd(scores.cool[1], bonus.cool[1]), '', '', '', ''];
    }
  };
}

/** @param {number} score @param {number} bonus */
function scoreWithBonusTd(score, bonus) {
  return  score +  bonus + "";
}

/**
 * @param {string|number} a
 * @param {string|number} b
 * @param {ClothesType} type
 * @returns {RatingTuple}
 */
function realRating(a, b, type) {
  var real = a ? a : b;
  var symbol = a ? 1 : -1;
  var numeric = Number(real);
  var key = String(real);
  var score;
  if(Number.isNaN(numeric))
	score = symbol * (type.score[key] ?? Number.NaN);
  else
	score = symbol * numeric * 15;
  var dev = type.deviation[key];
  return [a, b, score, dev];
}

/** @param {string} source @param {string} key */
function parseSource(source, key) {
  var idx = source.indexOf(key);
  var ridx = source.indexOf('/', idx+1);
  if (ridx < 0) ridx = 99;
  if (idx >= 0) {
    var id = source.substring(idx + 1, Math.min(idx + 4, ridx));
    while (id.length < 3) id = '0' + id;
    return id;
  }
  return null;
}

function calcDependencies() {
  for (var i in pattern) {
    var recipe = pattern[i];
    if (!recipe) continue;
    var target = typedClothesSet[recipe[0]]?.[recipe[1]];
    var source = typedClothesSet[recipe[2]]?.[recipe[3]];
    if (!target || !source) continue;
    source.addDep(recipe[5], recipe[4], target);
  }
}

/** @param {string} myClothes @returns {ClothesInventory} */
function load(myClothes) {
  var cs = myClothes.split(",");
  for (var i in typedClothes) {
    var clothing = typedClothes[i];
    if (!clothing) continue;
    clothing.own = false;
    if (cs.indexOf(clothing.name) >= 0) {
      clothing.own = true;
    }
  }
  var mine = MyClothes();
  mine.filter(typedClothes);
  return mine;
}

/** @param {string} myClothes @returns {ClothesInventory} */
function loadNew(myClothes) {
  var mine = MyClothes();
  mine.deserialize(myClothes);
  mine.update(typedClothes);
  return mine;
}

function loadFromStorage() {
  var storage = typeof localStorage !== 'undefined' ? localStorage : null;
  var stored = readBrowser(storage, document);
  if (stored.current) return loadNew(stored.current);
  if (stored.legacy) return load(stored.legacy);
  return MyClothes();
}

function save(){
  var myClothes = MyClothes();
  myClothes.filter(typedClothes);
  var txt = myClothes.serialize();
  var storage = typeof localStorage !== 'undefined' ? localStorage : null;
  writeBrowser(storage, document, txt);
  return myClothes;
}

export {
  FEATURES, CHINESE_TO_FEATURES, ACCRATIO, global, Clothes, clotonum, ScoreByCategory,
  MyClothes, clothes, clothesSet, createShoppingCart, shoppingCart, accScore, accSumScore,
  accCateNum, fakeClothes, scoreWithBonusTd, realRating, parseSource, calcDependencies,
  load, loadNew, loadFromStorage, save, accMul
};
