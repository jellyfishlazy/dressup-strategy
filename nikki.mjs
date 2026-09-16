import { FEATURES, global, shoppingCart, clothesSet, clothes, accMul, accSumScore, accCateNum, loadNew, load, MyClothes, loadFromStorage, save, calcDependencies } from './model.mjs';
import { drawTable, button_search, clothesNameTd_Search } from './ui.mjs';
import { initOnekey } from './onekeystrategy.mjs';
import { shareWardrobe } from './sharewardrobe.mjs';

const Dom = globalThis.Dom;
const category = globalThis.category;
const skipCategory = globalThis.skipCategory;
const replaceScoreBonusFactory = globalThis.replaceScoreBonusFactory;
const addScoreBonusFactory = globalThis.addScoreBonusFactory;
const clone = globalThis.clone;
const ReDrawcloneHeaderRow = globalThis.ReDrawcloneHeaderRow;
const allThemes = globalThis.allThemes;
const themeFilter = globalThis.themeFilter;
const scoring = globalThis.scoring;
const clothesHistoryNotice = globalThis.clothesHistoryNotice;
const levelHistoryNotice = globalThis.levelHistoryNotice;
const clothesNotice = globalThis.clothesNotice;
const levelNotice = globalThis.levelNotice;
const lastVersion = globalThis.lastVersion;
const menuFixed = globalThis.menuFixed;
const runtimeHooks = { drawTable: null, chooseAccessories: null, switchCate: null };

function configureRuntimeHooks(hooks = {}) {
	for (const name of ['drawTable', 'chooseAccessories', 'switchCate']) {
		if (Object.hasOwn(hooks, name)) {
			if (hooks[name] !== null && typeof hooks[name] !== 'function') throw new TypeError(`Invalid runtime hook: ${name}`);
			runtimeHooks[name] = hooks[name];
		}
	}
}

function invokeDrawTable(...args) {
	return (runtimeHooks.drawTable || drawTable)(...args);
}

function invokeChooseAccessories(...args) {
	return (runtimeHooks.chooseAccessories || chooseAccessories)(...args);
}

function invokeSwitchCate(...args) {
	return (runtimeHooks.switchCate || switchCate)(...args);
}
// Ivan's Workshop

var CATEGORY_HIERARCHY = function () {
	var ret = {};
	for (var i in category) {
		var type = category[i].split('-')[0];
		if (!ret[type]) {
			ret[type] = [];
		}
		ret[type].push(category[i]);
	}
	return ret;
}
();

function addShoppingCart(type, id) {
	shoppingCart.put(clothesSet[type][id]);
	refreshShoppingCart();
}

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
	var checked = !clothesSet[type][id].own;
	checked ? Dom('#clickable-' + type + id).addClass('own') : Dom('#clickable-' + type + id).removeClass("own");
	clothesSet[type][id].own = checked;
	saveAndUpdate();
}

var criteria = {};
function onChangeCriteria() {
	criteria = {};
	for (var i in FEATURES) {
		var f = FEATURES[i];
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
		var rank = [];
		rank.push(["simplerank" , totalscores[3] > totalscores[4] ? totalscores[3] : totalscores[4]]);
		rank.push(["cuterank" , totalscores[5] > totalscores[6] ? totalscores[5] : totalscores[6]]);
		rank.push(["activerank" , totalscores[7] > totalscores[8] ? totalscores[7] : totalscores[8]]);
		rank.push(["purerank" , totalscores[9] > totalscores[10] ? totalscores[9] : totalscores[10]]);
		rank.push(["coolrank" , totalscores[11] > totalscores[12] ? totalscores[11] : totalscores[12]]);
		rank.sort(function(a,b){
			return b[1] - a[1];
		});
		var numstr = ["Ⅰ","Ⅱ","Ⅲ","Ⅳ","Ⅴ"];
		for(var r  in rank){
			Dom("#" + rank[r][0]).text(numstr[r]);
		}
	}
}

function tagToBonus(criteria, id) {
	var tag = Dom('#' + id).val();
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

function clearTag(id) {
	Dom('#' + id).val('');
	Dom('#' + id + 'base').val('SS');
	Dom('#' + id + 'weight').val('1');
	Dom(Dom('input[name=' + id + 'method]:radio').get(0)).prop("checked", true);
	Dom(Dom('input[name=' + id + 'method]:radio').get(0)).parent().addClass("active");
	Dom(Dom('input[name=' + id + 'method]:radio').get(1)).parent().removeClass("active");
}

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
		if (CATEGORY_HIERARCHY[currentCategory].length > 1) {
			Dom('input[name=category-' + currentCategory + ']:checked').each(function () {
				uiFilter[Dom(this).val()] = true;
			});
		} else {
			uiFilter[currentCategory] = true;
		}
	}

	if(currentCategory == 'switchall'){
		for (var c in CATEGORY_HIERARCHY) {
			if (CATEGORY_HIERARCHY[c].length > 1) {
				for (var i in CATEGORY_HIERARCHY[c]) {
					uiFilter[CATEGORY_HIERARCHY[c][i]] = true;
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
			if (currentLevel.hint[0] && currentLevel.hint[0] != '') {
				var $hintInfo = Dom("<font>").text("過關提示:  ").addClass("hintInfo");
				$hint.append($hintInfo).append(currentLevel.hint[0]);
			}
			if (currentLevel.hint[1] && currentLevel.hint[1] != '') {
				var $notF = Dom("<font>").text("可穿戴部件:  ").addClass("not_f");
				$categoryF.append($notF).append(currentLevel.hint[1]);
			}
			$categoryF.append(Dom("<br>"));
			if (currentLevel.hint[2] && currentLevel.hint[2] != '') {
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

function byCategoryAndScore(a, b) {
	var cata = category.indexOf(a.type.type);
	var catb = category.indexOf(b.type.type);
	return (cata - catb == 0) ? b.sumScore - a.sumScore : cata - catb;
}
function byCategory(a, b) {
	var cata = category.indexOf(a);
	var catb = category.indexOf(b);
	return cata - catb;
}

function byScore(a, b) {
	return a.sumScore - b.sumScore == 0 ? a.id - b.id : b.sumScore - a.sumScore;
}

function byScoreS(Num) {
	return function(a, b) {
		return accSumScore(a,Num) - accSumScore(b,Num) == 0 ? a.id - b.id : accSumScore(b,Num) - accSumScore(a,Num);
	}
}

function byId(a, b) {
	var cata = category.indexOf(a.type.type);
	var catb = category.indexOf(b.type.type);
	return (cata - catb == 0) ? a.id - b.id : cata - catb;
}

function filterTopAccessories(filters) {
	filters['own'] = true;
	var accCate = CATEGORY_HIERARCHY['飾品'];
	var accCNum = accCateNum;
	var accSNum = 9;
	for (var i in accCate) {
		filters[accCate[i]] = true;
	}
	for (var i in skipCategory) {
		filters[skipCategory[i]] = false;
	}
	var resultS = {}; var resultAll = {};
	for (var i in clothes) {
		if (matches(clothes[i], {}, filters)) {
			clothes[i].calc(filters);
			if (clothes[i].isF || clothes[i].sumScore <= 0) continue;
			if (!resultS[clothes[i].type.type]) {
				resultS[clothes[i].type.type] = clothes[i];
			} else if (accSumScore(clothes[i],accSNum) > accSumScore(resultS[clothes[i].type.type],accSNum)) {
				resultS[clothes[i].type.type] = clothes[i];
			}
			if (!resultAll[clothes[i].type.type]) {
				resultAll[clothes[i].type.type] = clothes[i];
			} else if (accSumScore(clothes[i],accCNum) > accSumScore(resultAll[clothes[i].type.type],accCNum)) {
				resultAll[clothes[i].type.type] = clothes[i];
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

function filterTopClothes(filters) {
	filters['own'] = true;
	for (var i in CATEGORY_HIERARCHY) {
		if (i == "襪子") {
			filters[CATEGORY_HIERARCHY[i][0]] = true;
			filters[CATEGORY_HIERARCHY[i][1]] = true;
		}
		if (i != "飾品") {
			filters[CATEGORY_HIERARCHY[i]] = true;
		}
	}
	for (var i in skipCategory) {
		filters[skipCategory[i]] = false;
	}
	var result = {};
	for (var i in clothes) {
		if (matches(clothes[i], {}, filters)) {
			clothes[i].calc(filters);
			if (clothes[i].isF || clothes[i].sumScore <= 0) continue;
			if (!result[clothes[i].type.type]) {
				result[clothes[i].type.type] = clothes[i];
			} else if (clothes[i].sumScore > result[clothes[i].type.type].sumScore) {
				result[clothes[i].type.type] = clothes[i];
			}
		}
	}
	return result;
}

function filtering(criteria, filters) {
	var result = [];
	var result2 = [];
	for (var i in clothes) {
		if (matches(clothes[i], criteria, filters)) {
			clothes[i].calc(criteria);
			result.push(clothes[i]);
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
			if (resultIndex > 0 && result[resultIndex].type.type != result[resultIndex - 1].type.type)
				tsize = size;
			if (tsize > 0)
				result2.push(result[i]);
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
	for (var c in CATEGORY_HIERARCHY) {
		out += '<li id="' + c + '"><a href="#" data-switch-cate="' + c + '">' + c + '&nbsp;&nbsp;<span class="badge">0</span></a></li>';
	}
		out += '<li id="switchall"><a href="#" data-switch-cate="switchall">全部&nbsp;&nbsp;<span class="badge"></span></a></li>';
	out += "</ul>";
	for (var c in CATEGORY_HIERARCHY) {
		out += '<div id="category-' + c + '">';
		if (CATEGORY_HIERARCHY[c].length > 1) {
			// draw a select all checkbox...
			out += "<label><input type='checkbox' id='all-" + c + "' data-toggle-all='" + c + "' checked>全選</label><br/>";
			// draw sub categories
			for (var i in CATEGORY_HIERARCHY[c]) {
				out += "<label class='filterlabel'><input type='checkbox' name='category-" + c + "' value='" + CATEGORY_HIERARCHY[c][i]
				 + "' id='" + CATEGORY_HIERARCHY[c][i] + "' data-category-filter checked />" + CATEGORY_HIERARCHY[c][i].split("-")[1] + "</label>\n";
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

var currentCategory;
function setCurrentCategory(value) {
	currentCategory = value;
}
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
	if (allThemes[theme]) {
		setFilters(allThemes[theme]);
	}
	if (uiFilter['highscore']) autogenLimit();
	else onChangeCriteria();
}

var currentLevel; // used for post filtering.
function setFilters(level) {
	currentLevel = level;
	global.additionalBonus = currentLevel.additionalBonus;
	var weights = level.weight;
	for (var i in FEATURES) {
		var f = FEATURES[i];
		var weight = weights[f];
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
			bonusToTag(parseInt(i) + 1, level.bonus[i]);
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
	for (var index in themeFilter) {
		var option = document.createElement('option');
		option.text = themeFilter[index][0];
		option.value = themeFilter[index][1];
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

function updateSize(mine) {
	Dom("#inventoryCount").text('(' + mine.size + ')');
	Dom("#myClothes").val(mine.serialize());
	var subcount = {};
	for (var c in mine.mine) {
		var type = c.split('-')[0];
		if (!subcount[type]) {
			subcount[type] = 0;
		}
		subcount[type] += mine.mine[type].length;
	}
	for (var c in subcount) {
		Dom("#" + c + ">a span").text(subcount[c]);
	}
}

function doImport() {
	var dropdown = Dom("#importCate")[0];
	var type = dropdown.options[dropdown.selectedIndex].value;
	var raw = Dom("#importData").val();
	var data = raw.match(/\d+/g);
	var mapping = {}
	for (var i in data) {
		while (data[i].length < 3) {
			data[i] = "0" + data[i];
		}
		mapping[data[i]] = true;
	}
	var updating = [];
	for (var i in clothes) {
		if (clothes[i].type.mainType == type && mapping[clothes[i].id]) {
			updating.push(clothes[i].name);
		}
	}
	var names = updating.join(",");
	if(names.length > 50){
		names = names.substring(0,50) + "...等" + updating.length + "件衣服";
	}
	if (confirm("你將要在>>" + type + "<<中導入：\n" + names)) {
		var myClothes = MyClothes();
		myClothes.filter(clothes);
		if (myClothes.mine[type]) {
			myClothes.mine[type] = myClothes.mine[type].concat(data);
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

function getDistinct(arr){
	var newArr=[];
	for (var i in arr){
		if(Dom.inArray(arr[i], newArr)<0){
			newArr.push(arr[i]);
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
			if(clothes[i].isSuit.indexOf(searchTxt)>=0) {outSet.push(clothes[i].isSuit);}
		}
		if (outSet.length>0) {
			outSet=getDistinct(outSet);
			Dom('#searchResultList').append(button_search('套裝：','searchCate'));
			for (var i in outSet) {Dom('#searchResultList').append(button_search(outSet[i],'','searchResultSet'));}
			Dom(".searchResultSet").click(function () {
				invokeSwitchCate(0);
				var setName=Dom(this).attr('id').replace('search-','');
				Dom('#searchResultList').append(button_search(setName+'：','searchCate'));
				for (var i in clothes){
					if(clothes[i].isSuit==setName) {Dom('#searchResultList').append(clothesNameTd_Search(clothes[i]));}
				}
			});
		}
		for (var h in CATEGORY_HIERARCHY){
			var outCate=[];
			for (var i in clothes){
				if (clothes[i].type.mainType==h&&clothes[i].name.indexOf(searchTxt)>=0){
					outCate.push(clothesNameTd_Search(clothes[i]));
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
	for (var i in FEATURES) {
		var f = FEATURES[i];
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
	var clothesOrigScore=[];
	for(var i in clothes){
		clothes[i].calc(criteria);
		var sum_score=(clothes[i].type.mainType=='飾品') ? Math.round(accSumScore(clothes[i],(uiFilter["acc9"]?9:accCateNum))) : clothes[i].sumScore;
		clothesOrigScore[i]=sum_score;
	}

	//start loop
	var scoreTotal=0;
	var boosts=[];
	var ownCnt=loadFromStorage().size>0 ? 1 : 0;
	for (var a in FEATURES){
		for (var b in FEATURES){
			if (FEATURES[b]==FEATURES[a]) continue;
			//onChangeCriteria, calc highscore
			criteria = {};
			for (var i in FEATURES) {
				var f = FEATURES[i];
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
			var currScoreByCate=[];
			for (var i in clothes){
				if (!clothes[i].own&&ownCnt) continue;
				var c=clothes[i].type.type;
				if (Dom.inArray(c, skipCategory)>=0) continue;
				if (!currScoreByCate[c]) currScoreByCate[c]=0;
				if (clothesOrigScore[i]*1.778 < currScoreByCate[c]) continue; //short cut, no hope to become the new winner; from ip
				clothes[i].calc(criteria);
				var sum_score= (clothes[i].type.mainType=='飾品') ? Math.round(accSumScore(clothes[i],(uiFilter["acc9"]?9:accCateNum))) : clothes[i].sumScore;
				if (sum_score>currScoreByCate[c]) {
					shoppingCart.put(clothes[i]);
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
		var clotheslist = {};
		var clothesDivList = Dom("#clothes .table-body .table-row");
		for(var i = 0 ; i < clothesDivList.length; i++){
			var $row = Dom(clothesDivList[i])
			if($row.find(".name.own:first").length > 0 || $row.css("display") == "none"){
				continue;
			}
			var id  = $row.find(".id:first").text();
			var name  = $row.find(".name:first").text();
			var type = $row.find(".category:first").text().split("-")[0];
			if (clotheslist[type]) {
				clotheslist[type]["idlist"].push(id);
				clotheslist[type]["namelist"].push(name);
			} else {
				clotheslist[type] = {};
				clotheslist[type]["idlist"] = [id];
				clotheslist[type]["namelist"] = [name];
			}
		}
		if(clotheslist.length <= 0){
			alert("沒有需要添加的部件");
			return;
		}
		var confirmStr = "";
		for(var typeName in clotheslist){
			var names = clotheslist[typeName]["namelist"].join(",");
			if(names.length > 50){
				names = names.substring(0,50) + "...等" + clotheslist[typeName]["namelist"].length + "件衣服";
			}
			confirmStr += "你將要在>>" + typeName + "<<中導入：\n" + names + "\n";
		}
		if (confirm(confirmStr)) {
			var myClothes = MyClothes();
			myClothes.filter(clothes);
			for(var typeName in clotheslist){
				if (myClothes.mine[typeName]) {
					myClothes.mine[typeName] = myClothes.mine[typeName].concat(clotheslist[typeName]["idlist"]);
				} else {
					myClothes.mine[typeName] = clotheslist[typeName]["idlist"];
				}
			}
			myClothes.update(clothes);
			saveAndUpdate();
			refreshTable();
		}
	});
}

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
			for(var j = 0; j < strs.length; j++){
				if(filterCompare(Dom(clothesDivList[i]), type, cls, strs[j])){
					ifhide = false;
				}
				else{
					ifhide = ifhide && filterLoop(Dom(clothesDivList[i]), type, cls, strs[j]);
				}
			}
			if(ifhide){
				Dom(clothesDivList[i]).hide();
			}
		 }
}

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

function destroyClickedElement(event)
{
    document.body.removeChild(event.target);
}

function loadFileAsText()
{
    var fileInput = /** @type {HTMLInputElement|null} */ (document.getElementById("fileToLoad"));
    var textarea = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("myClothes"));
    var fileToLoad = fileInput?.files?.[0];
    if (!fileToLoad || !textarea) return;

    var fileReader = new FileReader();
    fileReader.onload = function(fileLoadedEvent)
    {
        var textFromFileLoaded = String(fileLoadedEvent.target?.result ?? '');
        textarea.value = textFromFileLoaded;
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
