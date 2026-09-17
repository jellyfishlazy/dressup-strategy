import { FEATURES, global, shoppingCart, clothesSet as modelClothesSet, clothes as modelClothes, accMul, accSumScore, accCateNum, loadNew, load, MyClothes, loadFromStorage, save, calcDependencies } from './model.mjs';
import { drawTable, button_search, clothesNameTd_Search } from './ui.mjs';
import { initOnekey } from './onekeystrategy.mjs';
import { shareWardrobe } from './sharewardrobe.mjs';

/** @typedef {import('./src/domain/scoring/types.d.ts').ScoringClothing} ScoringClothing */
/** @typedef {import('./src/domain/scoring/types.d.ts').Criteria} Criteria */
/** @typedef {import('./src/domain/scoring/types.d.ts').ScoreBonus} ScoreBonus */
/** @typedef {import('./src/legacy/native-dom-types.d.ts').DomCollection} DomCollection */
/** @typedef {ScoringClothing & { isSuit: string }} NikkiClothing */
/** @typedef {{ tag: string, replace?: boolean, base: string, weight: number }} BonusInfo */
/** @typedef {{ tagWhitelist?: string, nameWhitelist?: string }} LevelFilter */
/** @typedef {ScoreBonus & LevelFilter & { note?: string, param?: string | number }} LevelBonus */
/** @typedef {{ weight: Criteria, additionalBonus?: LevelBonus[] | null | undefined, filter?: LevelFilter | null, hint?: string[][] | undefined, skills?: string[][], bonus?: BonusInfo[] }} NikkiLevel */
/** @typedef {string | number | null | undefined} CategorySelection */
/** @typedef {(base: string, weight: number, tag: string) => (criteria: Criteria) => ScoreBonus} BonusFactory */

// Reuse the typed model collections directly while preserving collection identity.
/** @type {NikkiClothing[]} */
const clothes = modelClothes;
/** @type {Record<string, Record<string, NikkiClothing>>} */
const clothesSet = modelClothesSet;

/** @type {import('./src/legacy/native-dom-types.d.ts').DomFacade} */
const Dom = /** @type {typeof globalThis & { Dom: import('./src/legacy/native-dom-types.d.ts').DomFacade }} */ (globalThis).Dom;
const category = /** @type {typeof globalThis & { category: string[] }} */ (globalThis).category;
const skipCategory = /** @type {typeof globalThis & { skipCategory: string[] }} */ (globalThis).skipCategory;
const replaceScoreBonusFactory = /** @type {typeof globalThis & { replaceScoreBonusFactory: BonusFactory }} */ (globalThis).replaceScoreBonusFactory;
const addScoreBonusFactory = /** @type {typeof globalThis & { addScoreBonusFactory: BonusFactory }} */ (globalThis).addScoreBonusFactory;
const clone = /** @type {typeof globalThis & { clone: <T>(value: T) => T }} */ (globalThis).clone;
const ReDrawcloneHeaderRow = /** @type {typeof globalThis & { ReDrawcloneHeaderRow: () => void }} */ (globalThis).ReDrawcloneHeaderRow;
const allThemes = /** @type {typeof globalThis & { allThemes: Record<string, NikkiLevel> }} */ (globalThis).allThemes;
const themeFilter = /** @type {typeof globalThis & { themeFilter: string[][] }} */ (globalThis).themeFilter;
const scoring = /** @type {typeof globalThis & { scoring: Record<string, unknown> }} */ (globalThis).scoring;
const clothesHistoryNotice = /** @type {typeof globalThis & { clothesHistoryNotice: string }} */ (globalThis).clothesHistoryNotice;
const levelHistoryNotice = /** @type {typeof globalThis & { levelHistoryNotice: string }} */ (globalThis).levelHistoryNotice;
const clothesNotice = /** @type {typeof globalThis & { clothesNotice: string }} */ (globalThis).clothesNotice;
const levelNotice = /** @type {typeof globalThis & { levelNotice: string }} */ (globalThis).levelNotice;
const lastVersion = /** @type {typeof globalThis & { lastVersion: string }} */ (globalThis).lastVersion;
const menuFixed = /** @type {typeof globalThis & { menuFixed: ((id: string) => void) | undefined }} */ (globalThis).menuFixed;
// BigUse injects its draw/filter/category callbacks through these three stable callable seams.
/** @typedef {(...args: never[]) => unknown} RuntimeHook */
/** @type {Record<'drawTable' | 'chooseAccessories' | 'switchCate', RuntimeHook | null>} */
const runtimeHooks = { drawTable: null, chooseAccessories: null, switchCate: null };

/** @param {Partial<typeof runtimeHooks>} hooks */
function configureRuntimeHooks(hooks = {}) {
	for (const name of /** @type {const} */ (['drawTable', 'chooseAccessories', 'switchCate'])) {
		if (Object.hasOwn(hooks, name)) {
			const hook = hooks[name];
			if (hook !== null && typeof hook !== 'function') throw new TypeError(`Invalid runtime hook: ${name}`);
			runtimeHooks[name] = hook;
		}
	}
}

/** @param {Parameters<typeof drawTable>} args */
function invokeDrawTable(...args) {
	const hook = runtimeHooks.drawTable;
	return hook ? /** @type {typeof drawTable} */ (hook)(...args) : drawTable(...args);
}

/** @param {[accfilters: Criteria]} args */
function invokeChooseAccessories(...args) {
	const hook = runtimeHooks.chooseAccessories;
	return hook ? /** @type {typeof chooseAccessories} */ (hook)(...args) : chooseAccessories(...args);
}

/** @param {[category: CategorySelection]} args */
function invokeSwitchCate(...args) {
	const hook = runtimeHooks.switchCate;
	return hook ? /** @type {typeof switchCate} */ (hook)(...args) : switchCate(...args);
}
// Ivan's Workshop

var categoryHierarchy = function () {
	/** @type {Record<string, string[]>} */
	var ret = {};
	for (var i in category) {
		var categoryName = category[i];
		if (categoryName === undefined) continue;
		var type = categoryName.split('-')[0] ?? '';
		var group = ret[type];
		if (!group) {
			group = ret[type] = [];
		}
		group.push(categoryName);
	}
	return ret;
}
();

// Public hierarchy keeps object identity with the typed category map.
/** @type {Record<string, string[]>} */
const CATEGORY_HIERARCHY = categoryHierarchy;

/** @param {string} type @param {string} id */
function addShoppingCart(type, id) {
	const clothing = clothesSet[type]?.[id];
	if (!clothing) return;
	shoppingCart.put(clothing);
	refreshShoppingCart();
}

/** @param {string} type */
function removeShoppingCart(type) {
	shoppingCart.remove(type);
	refreshShoppingCart();
}

function clearShoppingCart() {
	shoppingCart.clear();
	refreshShoppingCart();
}

/**
 * @param {string} type
 * @param {string} id
 * @param {HTMLElement | null} [_triggerElement]
 */
function toggleInventory(type, id, _triggerElement) {
	const clothing = clothesSet[type]?.[id];
	if (!clothing) return;
	var checked = !clothing.own;
	checked ? Dom('#clickable-' + type + id).addClass('own') : Dom('#clickable-' + type + id).removeClass("own");
	clothing.own = checked;
	saveAndUpdate();
}

/** @type {Criteria} */
var criteria = {};
function onChangeCriteria() {
	criteria = {};
	for (const f of FEATURES) {

		var weight = parseFloat(Dom('#' + f + "Weight").val());
		if (!weight) {
			weight = 1;
		}
		if (uiFilter["highscore"]) {
			var highscore2 = Dom('#' + f + "1d778.active").length ? 1.778 : 1;
			var highscore1 = Dom('#' + f + "1d27.active").length ? 1.27 : 1;
			weight = accMul(accMul(weight, highscore1), highscore2);
			if (highscore1>1) criteria.highscore1=f;
			if (highscore2>1) criteria.highscore2=f;
		}
		var checked = Dom('input[name=' + f + ']:radio:checked');
		if (checked.length) {
			criteria[f] = parseInt(checked.val()) * weight;
		}
	}
	tagToBonus(criteria, 'tag1');
	tagToBonus(criteria, 'tag2');
	if (global.additionalBonus && global.additionalBonus.length > 0) {
		criteria.bonus = global.additionalBonus;
	}
	criteria.levelName = Dom("#theme").val();
	invokeChooseAccessories(criteria);
	drawLevelInfo();
	refreshTable();
	if(uiFilter["highscore"]){
		var totalscores = shoppingCart.totalScore.toCsv();
		/** @type {[string, number][]} */
		var rank = [];
		/** @param {number} index */
		const scoreAt = index => Number(totalscores[index] ?? 0);
		rank.push(["simplerank", Math.max(scoreAt(3), scoreAt(4))]);
		rank.push(["cuterank", Math.max(scoreAt(5), scoreAt(6))]);
		rank.push(["activerank", Math.max(scoreAt(7), scoreAt(8))]);
		rank.push(["purerank", Math.max(scoreAt(9), scoreAt(10))]);
		rank.push(["coolrank", Math.max(scoreAt(11), scoreAt(12))]);
		rank.sort(function(a,b){
			return b[1] - a[1];
		});
		var numstr = ["Ⅰ","Ⅱ","Ⅲ","Ⅳ","Ⅴ"];
		for (let rankIndex = 0; rankIndex < rank.length; rankIndex++) {
			const rankEntry = rank[rankIndex];
			if (!rankEntry) continue;
			Dom("#" + rankEntry[0]).text(numstr[rankIndex] ?? '');
		}
	}
}

/** @param {Criteria} criteria @param {string} id */
function tagToBonus(criteria, id) {
	var tag = Dom('#' + id).val();
	/** @type {ScoreBonus | null} */
	var bonus = null;
	if (tag.length > 0) {
		var base = Dom('#' + id + 'base :selected').text();
		var weight = parseFloat(Dom('#' + id + 'weight').val());
		if (Dom('input[name=' + id + 'method]:radio:checked').val() == 'replace') {
			bonus = replaceScoreBonusFactory(base, weight, tag)(criteria);
		} else {
			bonus = addScoreBonusFactory(base, weight, tag)(criteria);
		}
		if (!criteria.bonus) {
			criteria.bonus = [];
		}
		criteria.bonus.push(bonus);
	}
}

/** @param {string} id */
function clearTag(id) {
	Dom('#' + id).val('');
	Dom('#' + id + 'base').val('SS');
	Dom('#' + id + 'weight').val('1');
	Dom(Dom('input[name=' + id + 'method]:radio').get(0)).prop("checked", true);
	Dom(Dom('input[name=' + id + 'method]:radio').get(0)).parent().addClass("active");
	Dom(Dom('input[name=' + id + 'method]:radio').get(1)).parent().removeClass("active");
}

/** @param {number} idx @param {BonusInfo} info */
function bonusToTag(idx, info) {
	Dom('#tag' + idx).val(info.tag);
	if (info.replace) {
		Dom(Dom('input[name=tag' + idx + 'method]:radio').get(1)).prop("checked", true);
		Dom(Dom('input[name=tag' + idx + 'method]:radio').get(1)).parent().addClass("active");
		Dom(Dom('input[name=tag' + idx + 'method]:radio').get(0)).parent().removeClass("active");
	} else {
		Dom(Dom('input[name=tag' + idx + 'method]:radio').get(0)).prop("checked", true);
		Dom(Dom('input[name=tag' + idx + 'method]:radio').get(0)).parent().addClass("active");
	}
	Dom('#tag' + idx + 'base').val(info.base);
	Dom('#tag' + idx + 'weight').val(info.weight);
}

/** @type {Record<string, boolean>} */
var uiFilter = {};
function onChangeUiFilter() {
	uiFilter = {};
	Dom('.fliter:checked').each(function () {
		uiFilter[Dom(this).val()] = true;
	});

	if(uiFilter["toulan"]){
		Dom("#onekey").text("偷懶攻略");
	}
	else{
		Dom("#onekey").text("一鍵攻略");
	}

	if (currentCategory && currentCategory != 'switchall') {
		var activeCategories = categoryHierarchy[currentCategory];
		if (activeCategories && activeCategories.length > 1) {
			Dom('input[name=category-' + currentCategory + ']:checked').each(function () {
				uiFilter[Dom(this).val()] = true;
			});
		} else {
			uiFilter[currentCategory] = true;
		}
	}

	if(currentCategory == 'switchall'){
		for (var c in categoryHierarchy) {
			const group = categoryHierarchy[c];
			if (group && group.length > 1) {
				for (const subtype of group) {
					uiFilter[subtype] = true;
				}
			}
			uiFilter[c] = true;
		}
	}
	refreshTable();
}

function refreshTable() {
	invokeDrawTable(filtering(criteria, uiFilter), "clothes", false);
}

/** @param {Criteria} accfilters */
function chooseAccessories(accfilters) {
	shoppingCart.clear();
	shoppingCart.putAll(filterTopAccessories(clone(accfilters)));
	shoppingCart.putAll(filterTopClothes(clone(accfilters)));
	shoppingCart.validate(clone(accfilters));
	refreshShoppingCart();
}

function refreshShoppingCart() {
	shoppingCart.calc(criteria);
	invokeDrawTable(shoppingCart.toList(byCategoryAndScore), "shoppingCart", true);
}

function drawLevelInfo() {
	var info = "";
	var $skill = Dom("#skillInfo");
	var $categoryF = Dom("#categoryFInfo");
	var $hint = Dom("#hintInfo");
	$skill.empty();
	$hint.empty();
	$categoryF.empty();
	if (currentLevel) {
		var log = [];
		if (currentLevel.filter) {
			if (currentLevel.filter.tagWhitelist) {
				log.push("tag允許: [" + currentLevel.filter.tagWhitelist + "]");
			}
			if (currentLevel.filter.nameWhitelist) {
				log.push("名字含有: [" + currentLevel.filter.nameWhitelist + "]");
			}
		}
		if (currentLevel.additionalBonus) {
			for (var i in currentLevel.additionalBonus) {
				var bonus = currentLevel.additionalBonus[i];
				if (!bonus) continue;
				var match = "(";
				if (bonus.tagWhitelist) {
					match += "tag符合: " + bonus.tagWhitelist + " ";
				}
				if (bonus.nameWhitelist) {
					match += "名字含有: " + bonus.nameWhitelist;
				}
				match += ")";
				log.push(match + ": [" + bonus.note + " " + bonus.param + "]");
			}
		}
		if (currentLevel.hint) {
			var notF = "";
			if (currentLevel.hint[0] && String(currentLevel.hint[0]) != '') {
				var $hintInfo = Dom("<font>").text("過關提示:  ").addClass("hintInfo");
				$hint.append($hintInfo).append(currentLevel.hint[0]);
			}
			if (currentLevel.hint[1] && String(currentLevel.hint[1]) != '') {
				var $notF = Dom("<font>").text("可穿戴部件:  ").addClass("not_f");
				$categoryF.append($notF).append(currentLevel.hint[1]);
			}
			$categoryF.append(Dom("<br>"));
			if (currentLevel.hint[2] && String(currentLevel.hint[2]) != '') {
				var $isF = Dom("<font>").text("會導致F的部件: ").addClass("is_f");
				$categoryF.append($isF).append(currentLevel.hint[2]);
			}
		}
		if (currentLevel.skills) {
			var $shaonv,
			$gongzhu,
			$normal,
			shaonvSkill,
			gongzhuSkill,
			normalSkill;
			if (currentLevel.skills[0]) {
				$shaonv = Dom("<font>").text("少女級技能:  ").addClass("shaonvSkill");
				shaonvSkill = "";
				for (var i in currentLevel.skills[0]) {
					shaonvSkill += (currentLevel.skills[0][i] + "  ");
				}
			}
			if (currentLevel.skills[1]) {
				$gongzhu = Dom("<font>").text("公主級技能:  ").addClass("gongzhuSkill");
				gongzhuSkill = "";
				for (var i in currentLevel.skills[1]) {
					gongzhuSkill += (currentLevel.skills[1][i] + "  ");
				}
			}
			if (currentLevel.skills[2]) {
				$normal = Dom("<font>").text("技能:  ").addClass("normalSkill");
				normalSkill = "";
				for (var i in currentLevel.skills[2]) {
					normalSkill += (currentLevel.skills[2][i] + "  ");
				}
			}
			$skill.append($shaonv).append(shaonvSkill)
			.append($gongzhu).append(gongzhuSkill)
			.append($normal).append(normalSkill);
		}

		info = log.join(" ");
	}
	Dom("#tagInfo").text(info);
}

/** @param {ScoringClothing} a @param {ScoringClothing} b */
function byCategoryAndScore(a, b) {
	var cata = category.indexOf(a.type.type);
	var catb = category.indexOf(b.type.type);
	return (cata - catb == 0) ? Number(b.sumScore) - Number(a.sumScore) : cata - catb;
}
/** @param {string} a @param {string} b */
function byCategory(a, b) {
	var cata = category.indexOf(a);
	var catb = category.indexOf(b);
	return cata - catb;
}

/** @param {ScoringClothing} a @param {ScoringClothing} b */
function byScore(a, b) {
	return Number(a.sumScore) - Number(b.sumScore) == 0 ? Number(a.id) - Number(b.id) : Number(b.sumScore) - Number(a.sumScore);
}

/** @param {number} Num @returns {(a: ScoringClothing, b: ScoringClothing) => number} */
function byScoreS(Num) {
	return function(a, b) {
		return accSumScore(a,Num) - accSumScore(b,Num) == 0 ? Number(a.id) - Number(b.id) : accSumScore(b,Num) - accSumScore(a,Num);
	}
}

/** @param {ScoringClothing} a @param {ScoringClothing} b */
function byId(a, b) {
	var cata = category.indexOf(a.type.type);
	var catb = category.indexOf(b.type.type);
	return (cata - catb == 0) ? Number(a.id) - Number(b.id) : cata - catb;
}

/** @param {Criteria} filters */
function filterTopAccessories(filters) {
	filters['own'] = true;
	var accCate = categoryHierarchy['飾品'];
	var accCNum = accCateNum;
	var accSNum = 9;
	for (const subtype of accCate ?? []) {
		filters[subtype] = true;
	}
	for (const subtype of skipCategory) {
		filters[subtype] = false;
	}
	/** @type {Record<string, NikkiClothing>} */
	var resultS = {};
	/** @type {Record<string, NikkiClothing>} */
	var resultAll = {};
	for (var i in clothes) {
		const clothing = clothes[i];
		if (!clothing) continue;
		if (matches(clothing, {}, filters)) {
			clothing.calc(filters);
			if (clothing.isF || Number(clothing.sumScore) <= 0) continue;
			const previousShort = resultS[clothing.type.type];
			if (!previousShort) {
				resultS[clothing.type.type] = clothing;
			} else if (accSumScore(clothing,accSNum) > accSumScore(previousShort,accSNum)) {
				resultS[clothing.type.type] = clothing;
			}
			const previousAll = resultAll[clothing.type.type];
			if (!previousAll) {
				resultAll[clothing.type.type] = clothing;
			} else if (accSumScore(clothing,accCNum) > accSumScore(previousAll,accCNum)) {
				resultAll[clothing.type.type] = clothing;
			}
		}
	}

	shoppingCart.clear();
	shoppingCart.putAll(resultS);
	shoppingCart.validate(filters,accSNum);
	shoppingCart.calc(filters);
	var totalS = shoppingCart.totalScore.sumScore;
	var toSortS = clone(shoppingCart.cart);

	shoppingCart.clear();
	shoppingCart.putAll(resultAll);
	shoppingCart.validate(filters);
	shoppingCart.calc(filters);
	var totalAll = shoppingCart.totalScore.sumScore;
	var toSortAll = clone(shoppingCart.cart);

	shoppingCart.clear();

	if (totalS > totalAll || uiFilter["acc9"] ) return toSortS;
	else return toSortAll;
}

/** @param {Criteria} filters */
function filterTopClothes(filters) {
	filters['own'] = true;
	for (var i in categoryHierarchy) {
		var categoryGroup = categoryHierarchy[i];
		if (!categoryGroup) continue;
		if (i == "襪子") {
			if (categoryGroup[0]) filters[categoryGroup[0]] = true;
			if (categoryGroup[1]) filters[categoryGroup[1]] = true;
		}
		if (i != "飾品") {
			filters[String(categoryGroup)] = true;
		}
	}
	for (const subtype of skipCategory) {
		filters[subtype] = false;
	}
	/** @type {Record<string, NikkiClothing>} */
	var result = {};
	for (var i in clothes) {
		const clothing = clothes[i];
		if (!clothing) continue;
		if (matches(clothing, {}, filters)) {
			clothing.calc(filters);
			if (clothing.isF || Number(clothing.sumScore) <= 0) continue;
			const previous = result[clothing.type.type];
			if (!previous) {
				result[clothing.type.type] = clothing;
			} else if (Number(clothing.sumScore) > Number(previous.sumScore)) {
				result[clothing.type.type] = clothing;
			}
		}
	}
	return result;
}

/** @param {Criteria} criteria @param {Criteria} filters */
function filtering(criteria, filters) {
	var result = [];
	var result2 = [];
	for (var i in clothes) {
		const clothing = clothes[i];
		if (!clothing) continue;
		if (matches(clothing, criteria, filters)) {
			clothing.calc(criteria);
			result.push(clothing);
		}
	}
	var haveCriteria = false;
	for (var prop in criteria) {
		if (criteria[prop] != 0) {
			haveCriteria = true;
		}
	}
	if (haveCriteria) {
		if (filters.sortbyscore)
			result.sort(byScore);
		else
			result.sort(byCategoryAndScore);
	} else {
		if (filters.sortbyscore)
			result.sort(byScore);
		else
			result.sort(byId);
	}

	if (Dom("#showmore").attr("isshowmore") == 1) {
		var size = 10;
		if (result[0] && result[0].type.mainType == "飾品")
			size = 5;
		var tsize = size;
		for (var i in result) {
			var resultIndex = Number(i);
			const current = result[resultIndex];
			const previous = result[resultIndex - 1];
			if (!current) continue;
			if (previous && current.type.type != previous.type.type)
				tsize = size;
			if (tsize > 0)
				result2.push(current);
			tsize--;
		}
		if (filters.sortbyscore)
			result2.sort(byScore);
		else
			result.sort(byCategoryAndScore);
		return result2;
	}
	return result;
}

/** @param {Pick<ScoringClothing, "own" | "type">} c @param {Criteria} criteria @param {Criteria} filters */
function matches(c, criteria, filters) {
	return ((c.own && filters.own) || (!c.own && filters.missing)) && filters[c.type.type];
}

function loadCustomInventory() {
	var myClothes = Dom("#myClothes").val();
	myClothes = myClothes.replace("发型","髮型").replace("连衣裙","連身裙").replace("上装","上衣").replace("下装","下著").replace("袜子","襪子").replace("饰品","飾品").replace("妆容","妝容").replace("萤光之灵","螢光之靈");
	Dom("#myClothes").val(myClothes);
	if (myClothes.indexOf('|') > 0) {
		loadNew(myClothes);
	} else {
		load(myClothes);
	}
	saveAndUpdate();
	refreshTable();
}

/** @param {string | null} c */
function toggleAll(c) {
	var all = Dom('#all-' + c)[0].checked;
	var x = Dom('input[name=category-' + c + ']:checkbox');
	x.each(function () {
		this.checked = all;
	});
	onChangeUiFilter();
}

function drawFilter() {//refactor me
	var out = "<ul class='nav nav-tabs nav-justified' id='categoryTab'>";
	for (var c in categoryHierarchy) {
		out += '<li id="' + c + '"><a href="#" data-switch-cate="' + c + '">' + c + '&nbsp;&nbsp;<span class="badge">0</span></a></li>';
	}
		out += '<li id="switchall"><a href="#" data-switch-cate="switchall">全部&nbsp;&nbsp;<span class="badge"></span></a></li>';
	out += "</ul>";
	for (var c in categoryHierarchy) {
		out += '<div id="category-' + c + '">';
		const group = categoryHierarchy[c];
		if (group && group.length > 1) {
			// draw a select all checkbox...
			out += "<label><input type='checkbox' id='all-" + c + "' data-toggle-all='" + c + "' checked>全選</label><br/>";
			// draw sub categories
			for (const subtype of group) {
				out += "<label class='filterlabel'><input type='checkbox' name='category-" + c + "' value='" + subtype
				 + "' id='" + subtype + "' data-category-filter checked />" + subtype.split("-")[1] + "</label>\n";
			}
		}
		out += '</div>';
	}
	Dom('#category_container').html(out);
	Dom('#categoryTab a[data-switch-cate]').click(function (event) {
		event.preventDefault();
		invokeSwitchCate(this.getAttribute('data-switch-cate'));
	});
	Dom('input[data-toggle-all]').change(function () {
		toggleAll(this.getAttribute('data-toggle-all'));
	});
	Dom('input[data-category-filter]').change(onChangeUiFilter);
}

/** @type {CategorySelection} */
var currentCategory;
/** @param {CategorySelection} value */
function setCurrentCategory(value) {
	currentCategory = value;
}
/** @param {CategorySelection} c */
function switchCate(c) {
	Dom("#searchResultList").html('');
	currentCategory = c;
	Dom("ul#categoryTab li").removeClass("active");
	Dom("#category_container div").removeClass("active");
	Dom("#" + c).addClass("active");
	Dom("#category-" + c).addClass("active");
	onChangeUiFilter();
	ReDrawcloneHeaderRow();
	return false;
}

function changeFilter() {
	Dom("#theme")[0].options[0].selected = true;
	currentLevel = null;
	if (uiFilter['highscore']) autogenLimit();
	else onChangeCriteria();
}

function changeTheme() {
	currentLevel = null;
	global.additionalBonus = null;
	var theme = Dom("#theme").val();
	const level = allThemes[theme];
	if (level) {
		setFilters(level);
	}
	if (uiFilter['highscore']) autogenLimit();
	else onChangeCriteria();
}

/** @type {NikkiLevel | null | undefined} */
var currentLevel; // used for post filtering.
/** @param {NikkiLevel} level */
function setFilters(level) {
	currentLevel = level;
	// Legacy levels may omit this field; preserve the existing undefined assignment.
	/** @type {{ additionalBonus: ScoreBonus[] | null | undefined }} */ (global).additionalBonus = currentLevel.additionalBonus;
	var weights = level.weight;
	for (const f of FEATURES) {

		var weight = weights[f] ?? 0;
		if (uiFilter["balance"]) {
			if (weight > 0) {
				weight = 1;
			} else if (weight < 0) {
				weight = -1;
			}
		}
		Dom('#' + f + 'Weight').val(Math.abs(weight));
		var radios = Dom('input[name=' + f + ']:radio');
		for (var j = 0; j < radios.length; j++) {
			var element = Dom(radios[j]);
			if (parseInt(element.attr("value")) * weight > 0) {
				element.prop("checked", true);
				element.parent().addClass("active");
			} else if (element.parent()) {
				element.parent().removeClass("active");
			}
		}
	}
	clearTag('tag1');
	clearTag('tag2');
	if (level.bonus) {
		for (var i in level.bonus) {
			const bonus = level.bonus[i];
			if (bonus) bonusToTag(parseInt(i) + 1, bonus);
		}
	}
}

function drawTheme() {
	var dropdown = Dom("#theme")[0];
	var def = document.createElement('option');
	def.text = '自訂關卡';
	def.value = 'custom';
	dropdown.add(def);
	for (var theme in allThemes) {
		var option = document.createElement('option');
		option.text = theme;
		option.value = theme;
		dropdown.add(option);
	}

	var dropdown2 = Dom("#theme-fliter")[0];
	var def2 = document.createElement('option');
	def2.text = '篩選';
	def2.value = 'custom';
	dropdown2.add(def2);
	for (const filterEntry of themeFilter) {
		var option = document.createElement('option');
		if (!filterEntry) continue;
		option.text = filterEntry[0] ?? '';
		option.value = filterEntry[1] ?? '';
		dropdown2.add(option);
	}
}

function reDrawTheme() {
	var fliterStr = Dom("#theme-fliter").val();
	var dropdown = Dom("#theme");
	dropdown.empty();
	var def = document.createElement('option');
	def.text = '自訂關卡';
	def.value = 'custom';
	dropdown[0].add(def);
	for (var theme in allThemes) {
		var option = document.createElement('option');
		option.text = theme;
		option.value = theme;
		if(theme.indexOf(fliterStr)>=0 || fliterStr == "custom"){
			dropdown[0].add(option);
		}
	}
}

function drawImport() {
	var dropdown = Dom("#importCate")[0];
	var def = document.createElement('option');
	def.text = '請選擇類別';
	def.value = '';
	dropdown.add(def);
	for (var cate in scoring) {
		var option = document.createElement('option');
		option.text = cate;
		option.value = cate;
		dropdown.add(option);
	}
}

function clearImport() {
	Dom("#importData").val("");
}

function saveAndUpdate() {
	var mine = save();
	updateSize(mine);
}

/** @param {import('./src/domain/inventory/types.d.ts').Inventory<ScoringClothing>} mine */
function updateSize(mine) {
	Dom("#inventoryCount").text('(' + mine.size + ')');
	Dom("#myClothes").val(mine.serialize());
	/** @type {Record<string, number>} */
	var subcount = {};
	for (var c in mine.mine) {
		var type = c.split('-')[0] ?? c;
		if (!subcount[type]) {
			subcount[type] = 0;
		}
		var ownedIds = mine.mine[c];
		if (ownedIds) subcount[type] = (subcount[type] || 0) + ownedIds.length;
	}
	for (var c in subcount) {
		Dom("#" + c + ">a span").text(subcount[c]);
	}
}

function doImport() {
	var dropdown = Dom("#importCate")[0];
	var type = dropdown.options[dropdown.selectedIndex].value;
	var raw = Dom("#importData").val();
	var data = raw.match(/\d+/g) || [];
	/** @type {Record<string, boolean>} */
	var mapping = {}
	for (let dataIndex = 0; dataIndex < data.length; dataIndex++) {
		let value = data[dataIndex] ?? '';
		while (value.length < 3) {
			value = "0" + value;
		}
		data[dataIndex] = value;
		mapping[value] = true;
	}
	var updating = [];
	for (var i in clothes) {
		const clothing = clothes[i];
		if (!clothing) continue;
		if (clothing.type.mainType == type && mapping[clothing.id]) {
			updating.push(clothing.name);
		}
	}
	var names = updating.join(",");
	if(names.length > 50){
		names = names.substring(0,50) + "...等" + updating.length + "件衣服";
	}
	if (confirm("你將要在>>" + type + "<<中導入：\n" + names)) {
		var myClothes = MyClothes();
		myClothes.filter(clothes);
		var existingIds = myClothes.mine[type];
		if (existingIds) {
			myClothes.mine[type] = existingIds.concat(data);
		} else {
			myClothes.mine[type] = data;
		}
		myClothes.update(clothes);
		saveAndUpdate();
		refreshTable();
		clearImport();
	}
}

function goTop() {
	Dom("html,body").animate({
		scrollTop : 0
	}, 500);
}

/** @template T @param {T[]} arr @returns {T[]} */
function getDistinct(arr){
	/** @type {T[]} */
	var newArr=[];
	for (var i in arr){
		const entry = /** @type {T} */ (arr[i]); // for...in visits existing keys only.
		if(Dom.inArray(entry, newArr)<0){
			newArr.push(entry);
		}
	}
	return newArr;
}

function toggleSearchResult(){
	if(Dom("#searchResultCheck").is(':checked')) Dom('#searchResult').show();
	else Dom('#searchResult').hide();
}

function searchResult(){
	invokeSwitchCate(0);
	var searchTxt=Dom('#searchResultInput').val();
	if (searchTxt){
		var outSet=[];
		for (var i in clothes){
			const clothing = clothes[i];
			if (!clothing) continue;
			if(clothing.isSuit.indexOf(searchTxt)>=0) {outSet.push(clothing.isSuit);}
		}
		if (outSet.length>0) {
			outSet=getDistinct(outSet);
			Dom('#searchResultList').append(button_search('套裝：','searchCate'));
			for (const suit of outSet) {Dom('#searchResultList').append(button_search(suit,'','searchResultSet'));}
			Dom(".searchResultSet").click(function () {
				invokeSwitchCate(0);
				var setName=Dom(this).attr('id').replace('search-','');
				Dom('#searchResultList').append(button_search(setName+'：','searchCate'));
				for (var i in clothes){
					const clothing = clothes[i];
					if (!clothing) continue;
					if(clothing.isSuit==setName) {Dom('#searchResultList').append(clothesNameTd_Search(clothing));}
				}
			});
		}
		for (var h in categoryHierarchy){
			var outCate=[];
			for (var i in clothes){
				const clothing = clothes[i];
				if (!clothing) continue;
				if (clothing.type.mainType==h&&clothing.name.indexOf(searchTxt)>=0){
					outCate.push(clothesNameTd_Search(clothing));
				}
			}
			if (outCate.length>0){
				Dom('#searchResultList').append(button_search(h+'：','searchCate'));
				for (var i in outCate){
					Dom('#searchResultList').append(outCate[i]);
				}
			}
		}
	}
}

function autogenLimit(){
	//onChangeCriteria, calc normal weight
	criteria = {};
	for (const f of FEATURES) {

		var weight = parseFloat(Dom('#' + f + "Weight").val());
		if (!weight) {
			weight = 1;
		}
		var checked = Dom('input[name=' + f + ']:radio:checked');
		if (checked.length) {
			criteria[f] = parseInt(checked.val()) * weight;
		}
	}
	tagToBonus(criteria, 'tag1');
	tagToBonus(criteria, 'tag2');
	if (global.additionalBonus && global.additionalBonus.length > 0) {
		criteria.bonus = global.additionalBonus;
	}
	criteria.levelName = Dom("#theme").val();
	/** @type {number[]} */
	var clothesOrigScore=[];
	for(var i in clothes){
		const clothing = clothes[i];
		if (!clothing) continue;
		clothing.calc(criteria);
		var sum_score=(clothing.type.mainType=='飾品') ? Math.round(accSumScore(clothing,(uiFilter["acc9"]?9:accCateNum))) : Number(clothing.sumScore);
		clothesOrigScore[i]=sum_score;
	}

	//start loop
	var scoreTotal=0;
	/** @type {(import('./src/domain/scoring/types.d.ts').FeatureName | undefined)[]} */
	var boosts=[];
	var ownCnt=loadFromStorage().size>0 ? 1 : 0;
	for (var a in FEATURES){
		for (var b in FEATURES){
			if (FEATURES[b]==FEATURES[a]) continue;
			//onChangeCriteria, calc highscore
			criteria = {};
			for (const f of FEATURES) {

				var weight = parseFloat(Dom('#' + f + "Weight").val());
				if (!weight) {
					weight = 1;
				}
				if (f==FEATURES[b]) {weight=accMul(weight,1.27);criteria.highscore1=f;}
				if (f==FEATURES[a]) {weight=accMul(weight,1.778);criteria.highscore2=f;}
				var checked = Dom('input[name=' + f + ']:radio:checked');
				if (checked.length) {
					criteria[f] = parseInt(checked.val()) * weight;
				}
			}
			tagToBonus(criteria, 'tag1');
			tagToBonus(criteria, 'tag2');
			if (global.additionalBonus && global.additionalBonus.length > 0) {
				criteria.bonus = global.additionalBonus;
			}
			criteria.levelName = Dom("#theme").val();
			//calc sumScores
			shoppingCart.clear();
			/** @type {Record<string, number>} */
			var currScoreByCate={};
			for (var i in clothes){
				const clothing = clothes[i];
				if (!clothing) continue;
				if (!clothing.own&&ownCnt) continue;
				var c=clothing.type.type;
				if (Dom.inArray(c, skipCategory)>=0) continue;
				if (!currScoreByCate[c]) currScoreByCate[c]=0;
				const originalScore = clothesOrigScore[i];
				const bestScore = currScoreByCate[c] ?? 0;
				if (originalScore !== undefined && originalScore*1.778 < bestScore) continue; //short cut, no hope to become the new winner; from ip
				clothing.calc(criteria);
				var sum_score= (clothing.type.mainType=='飾品') ? Math.round(accSumScore(clothing,(uiFilter["acc9"]?9:accCateNum))) : Number(clothing.sumScore);
				if (sum_score>bestScore) {
					shoppingCart.put(clothing);
					currScoreByCate[c]=sum_score;
				}
			}
			shoppingCart.validate(criteria);
			shoppingCart.calc(criteria);
			var tmpScore=shoppingCart.totalScore.sumScore;
			if (tmpScore>scoreTotal){
				scoreTotal=tmpScore;
				boosts=[FEATURES[b],FEATURES[a]];
			}
		}
	}
	Dom(".1d27").removeClass("active");
	Dom(".1d778").removeClass("active");
	Dom('#' + boosts[0] + "1d27").addClass("active");
	Dom('#' + boosts[1] + "1d778").addClass("active");
	onChangeCriteria();
}

function initEvent() {
	Dom("#show_history").click(function () {
		Dom("#update_history").show();
		Dom("#show_history").hide();
		Dom("#history-update-info-2").html(clothesHistoryNotice);
		Dom("#history-update-info-3").html(levelHistoryNotice);
		return false;
	});
	Dom(".fliter").change(function () {
		onChangeUiFilter();
		if (this.value == "balance") {
			changeTheme();
		}
		if (this.value == "highscore") {
			Dom(".highscore-link").toggle();
			Dom(".highscore-rank").toggle();
			if (Dom(this).is(':checked')) autogenLimit();
			else onChangeCriteria();
		}
		if (this.value == "acc9") {
			onChangeCriteria();
		}
	});
	Dom(".filter-radio").change(function () {
		changeFilter();
	});
	Dom(".highscore-link").click(function () {
		var has = Dom(this).hasClass("active");
		if(Dom(this).hasClass("1d27")){
			Dom(".1d27").removeClass("active");
		}
		if(Dom(this).hasClass("1d778")){
			Dom(".1d778").removeClass("active");
		}
		if(!has){
			Dom(this).addClass("active");
		}
		onChangeCriteria();
	});
	Dom("#sharewardrobe").click(function(){
		shareWardrobe();
	});
	Dom(".showmore").click(function(){
		var obj  = Dom(".showmore");
		Dom(obj[1]).attr("isshowmore", (1 - Dom(obj[1]).attr("isshowmore")));
		if(Dom(obj[1]).attr("isshowmore") == "1"){
			Dom(obj[0]).text("↓ 顯示全部衣服 ↓");
			Dom(obj[1]).text("↓ 顯示全部衣服 ↓");
		}
		else{
			Dom(obj[0]).text("↑ 收起衣櫃 ↑");
			Dom(obj[1]).text("↑ 收起衣櫃 ↑");
		}
		onChangeUiFilter();
		if (typeof menuFixed === 'function') menuFixed("clothes");
		return false;
	});
	Dom("#searchResultMode").click(function(){
		if (Dom(this).hasClass("active")) {Dom(this).removeClass("active");Dom(this).html('→衣櫃');}
		else {Dom(this).addClass("active");Dom(this).html('→購物車');}
	});
	Dom('#searchResultInput').keydown(function(e) {
		if (e.keyCode==13) {
			Dom(this).blur();
			searchResult();
		}
	});
	toggleSearchResult();
	initOnekey();

	//前臺篩選
	Dom(".front_filter_option").click(function(){
		filterClotherHTML(this);
		 return false;
	});
	Dom("#add_all").click(function(){
		/** @type {Record<string, {idlist: string[], namelist: string[]}>} */
		var clotheslist = {};
		var clothesDivList = Dom("#clothes .table-body .table-row");
		for(var i = 0 ; i < clothesDivList.length; i++){
			var $row = Dom(clothesDivList[i])
			if($row.find(".name.own:first").length > 0 || $row.css("display") == "none"){
				continue;
			}
			var id  = $row.find(".id:first").text();
			var name  = $row.find(".name:first").text();
			var type = $row.find(".category:first").text().split("-")[0] ?? '';
			if (!type) continue;
			var clothesEntry = clotheslist[type];
			if (clothesEntry) {
				clothesEntry.idlist.push(id);
				clothesEntry.namelist.push(name);
			} else {
				clotheslist[type] = { idlist: [id], namelist: [name] };


			}
		}
		if(Object.keys(clotheslist).length === 0){
			alert("沒有需要添加的部件");
			return;
		}
		var confirmStr = "";
		for(var typeName in clotheslist){
			var clothesEntry = clotheslist[typeName];
			if (!clothesEntry) continue;
			var names = clothesEntry.namelist.join(",");
			if(names.length > 50){
				names = names.substring(0,50) + "...等" + clothesEntry.namelist.length + "件衣服";
			}
			confirmStr += "你將要在>>" + typeName + "<<中導入：\n" + names + "\n";
		}
		if (confirm(confirmStr)) {
			var myClothes = MyClothes();
			myClothes.filter(clothes);
			for(var typeName in clotheslist){
			var clothesEntry = clotheslist[typeName];
			if (!clothesEntry) continue;
					var existingIds = myClothes.mine[typeName];
				if (existingIds) {
					myClothes.mine[typeName] = existingIds.concat(clothesEntry.idlist);
				} else {
					myClothes.mine[typeName] = clothesEntry.idlist;
				}
			}
			myClothes.update(clothes);
			saveAndUpdate();
			refreshTable();
		}
	});
}

/** @param {HTMLElement} btn */
function filterClotherHTML(btn){
		var clothesDivList = Dom("#clothes .table-body .table-row");
		var str = "";
		var cls = ".source:first";
		var type = 0;
		switch(Dom(btn).text()){
			case "清空篩選": type = 0; break;
			case "尚缺材料": cls = ".deps:first"; type = 3; break;
			case "暫不缺材料": cls = ".depsFin:first"; type = 3; break;
			case "少女級": str = "少"; type = 1; break;
			case "少女染/進": str = "少"; type = 2; break;
			case "公主級": str = "公"; type = 1;break;
			case "公主染/進": str = "公"; type = 2; break;
			case "店": str = "店"; type = 1;break;
			case "店染/進": str = "店"; type = 2; break;
			case "設計圖": str = "設計圖"; type = 1;break;
			case "設計圖染/進": str = "設計圖"; type = 2; break;
			case "活動": str = "活動·"; type = 2; break;
			case "夢境": str = "夢境·"; type = 2; break;
			case "謎之屋限定": str = "謎,幻,謎/幻,雲禪,晝夜,縹緲,晝夜/兌·時光,雲禪/兌·臥雲,縹緲/兌·翡翠"; type = -1; break;
			case "謎之屋限定染/進": str = "謎,幻,謎/幻,雲禪,晝夜,縹緲,晝夜/兌·時光,雲禪/兌·臥雲,縹緲/兌·翡翠"; type = -2; break;
			case "3星": str = "3"; cls = ".star:first"; type = 1; break;
			case "4星": str = "4"; cls = ".star:first"; type = 1; break;
			case "5星": str = "5"; cls = ".star:first"; type = 1; break;
			case "贈送/簽到": str = "贈送,簽到"; type = 1; break;
			case "套裝部件": cls = ".issuit:first"; type = 3; break;
			case "新品": cls = ".version:first"; str=lastVersion; type = 1; break;
		}
		 for(var i = 0 ; i < clothesDivList.length; i++){
			 if(type == 0){//清空
				Dom(clothesDivList[i]).show();
				continue;
			 }
			var ifhide = true;
			var strs = str.split(",");
			for (const part of strs){
				if(filterCompare(Dom(clothesDivList[i]), type, cls, part)){
					ifhide = false;
				}
				else{
					ifhide = ifhide && filterLoop(Dom(clothesDivList[i]), type, cls, part);
				}
			}
			if(ifhide){
				Dom(clothesDivList[i]).hide();
			}
		 }
}

/** @param {DomCollection} obj @param {number} type @param {string} cls @param {string} str @returns {boolean} */
function filterLoop(obj, type, cls, str){
	if(filterCompare(obj, type, ".source:first", "定")
		|| filterCompare(obj, type, ".source:first", "進")){
		var id = obj.find(".source:first").text().replace(/(定|進)([0-9]+)[^0-9]*/, "$2");
		var $source = Dom("#clickable-" + obj.find(".category:first").text().split("-")[0] + id).parent();
		if(filterCompare($source, type, cls, str)){
			return false;
		}
		else{
			return filterLoop($source, type, cls, str);
		}
	}
	return true;
}

/** @param {DomCollection} obj @param {number} type @param {string} cls @param {string} str */
function filterCompare(obj, type, cls, str){
	if(str == "定" || str == "進"){
		if(type != 2 && type != -2){
			return false;
		}
		else{
			type = 2;
		}
	}
	if(type == 3){
		return obj.find(cls).text().length > 0;
	}
	if(type > 0){
		return obj.find(cls).text().indexOf(str) >= 0;
	}
	if(type < 0){
		return obj.find(cls).text() == str;
	}
}

function initNotice() {
	Dom("#update-info-2").html(clothesNotice);
	Dom("#update-info-3").html(levelNotice);
}

function init() {
	var mine = loadFromStorage();
	calcDependencies();
	drawFilter();
	drawTheme();
	drawImport();
	invokeSwitchCate(category[0]);
	updateSize(mine);
	refreshShoppingCart();
	initEvent();
}

function exportCustomInventory() {
	var $link = Dom("#clothesDownload");
	var blob = new Blob([Dom("#myClothes").val()],
		{ type:"application/octect-stream" });
	var blobUrl = URL.createObjectURL(blob);
	var fileName = "clothes.txt";
	$link.attr({ href: blobUrl, download: fileName })
		.text(fileName);
}

function saveTextAsFile()
{
    var textarea = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("myClothes"));
    var fileNameInput = /** @type {HTMLInputElement|null} */ (document.getElementById("inputFileNameToSaveAs"));
    if (!textarea || !fileNameInput) return;
    var textToSave = textarea.value;
    var textToSaveAsBlob = new Blob([textToSave], {type:"text/plain"});
    var textToSaveAsURL = window.URL.createObjectURL(textToSaveAsBlob);
    var fileNameToSaveAs = fileNameInput.value;

    var downloadLink = document.createElement("a");
    downloadLink.download = fileNameToSaveAs;
    downloadLink.innerHTML = "Download File";
    downloadLink.href = textToSaveAsURL;
    downloadLink.addEventListener('click', destroyClickedElement, { once: true });
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);

    downloadLink.click();
}

/** @param {MouseEvent} event */
function destroyClickedElement(event)
{
    if (event.target instanceof window.Node) document.body.removeChild(event.target);
}

function loadFileAsText()
{
    var fileInput = /** @type {HTMLInputElement|null} */ (document.getElementById("fileToLoad"));
    var textarea = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("myClothes"));
    var fileToLoad = fileInput?.files?.[0];
    if (!fileToLoad || !textarea) return;
    const targetTextarea = textarea;

    var fileReader = new FileReader();
    fileReader.onload = function(fileLoadedEvent)
    {
        var textFromFileLoaded = String(fileLoadedEvent.target?.result ?? '');
        targetTextarea.value = textFromFileLoaded;
    };
    fileReader.readAsText(fileToLoad, "UTF-8");
}

function bootMainMatcher() {
	initNotice();
	init();
	if (typeof menuFixed === 'function') menuFixed("clothes");
}

export {
  CATEGORY_HIERARCHY, criteria, uiFilter, currentCategory, currentLevel,
  addShoppingCart, removeShoppingCart, clearShoppingCart, toggleInventory,
  onChangeCriteria, accMul, tagToBonus, clearTag, bonusToTag, onChangeUiFilter,
  refreshTable, chooseAccessories, refreshShoppingCart, drawLevelInfo,
  byCategoryAndScore, byCategory, byScore, byScoreS, byId, filterTopAccessories,
  filterTopClothes, filtering, matches, loadCustomInventory, toggleAll, drawFilter,
  switchCate, changeFilter, changeTheme, setFilters, drawTheme, reDrawTheme,
  drawImport, clearImport, saveAndUpdate, updateSize, doImport, goTop, getDistinct,
  toggleSearchResult, searchResult, autogenLimit, initEvent, filterClotherHTML,
  filterLoop, filterCompare, initNotice, init, exportCustomInventory, saveTextAsFile,
  destroyClickedElement, loadFileAsText, bootMainMatcher, configureRuntimeHooks, setCurrentCategory
};
