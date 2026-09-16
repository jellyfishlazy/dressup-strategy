import { clothes, accSumScore, accCateNum } from './model.mjs';
import { CATEGORY_HIERARCHY, criteria, uiFilter, matches } from './nikki.mjs';
import { lanStrategy } from './onekeystrategy_lan.mjs';

/** @typedef {import('./src/domain/scoring/types.d.ts').ScoringClothing} ScoringClothing */
/** @typedef {import('./src/domain/scoring/types.d.ts').Criteria} Criteria */
/** @typedef {Record<import('./src/domain/scoring/types.d.ts').FeatureName, number>} FeatureWeights */
/** @typedef {ScoringClothing & { isSuit?: unknown }} StrategyClothing */
/** @typedef {Record<string, StrategyClothing[]>} StrategyResults */
/** @typedef {import('./src/domain/scoring/types.d.ts').ScoreBonus & { tagWhitelist?: string | string[], param?: number }} StrategyBonus */

/** @type {import('./src/legacy/native-dom-types.d.ts').DomFacade} */
const Dom = /** @type {typeof globalThis & { Dom: import('./src/legacy/native-dom-types.d.ts').DomFacade }} */ (globalThis).Dom;
const category = /** @type {typeof globalThis & { category: string[] }} */ (globalThis).category;
const skipCategory = /** @type {typeof globalThis & { skipCategory: string[] }} */ (globalThis).skipCategory;
const repelCates = /** @type {typeof globalThis & { repelCates: string[][] }} */ (globalThis).repelCates;
const allThemes = /** @type {typeof globalThis & { allThemes: Record<string, { weight: FeatureWeights }> }} */ (globalThis).allThemes;
const clone = /** @type {typeof globalThis & { clone: <T>(value: T) => T }} */ (globalThis).clone;
/**
 * @param {string[] | null} [keywords]
 * @param {{ name: string, score: number }[]} [suits]
 */
function showStrategy(keywords, suits){
	if((/** @type {Record<string, boolean>} */ (uiFilter))["toulan"]){
		lanStrategy();
		return;
	}
	/** @type {string[]} */
	var suitNames = [];
	/** @param {StrategyClothing} clothes */
	function haveKeywords(clothes){
		if(keywords == null){
			return true;
		}
		var strs = Dom.unique(clothes["name"].split(""));
		var _size = strs.length + keywords.length;
		var newArray = Dom.merge(strs, keywords);
		var size_ = Dom.unique(newArray).length;
		if(_size > size_)
			return true;
		return (Dom.inArray(clothes["isSuit"], /** @type {unknown[]} */ (suitNames))>=0);
	}

	var $strategy = Dom("<div/>").addClass("strategy_info_div");

	var theme = allThemes[Dom("#theme").val()];
	var filters = clone(/** @type {Criteria} */ (criteria));
	filters.own = true;
	filters.missing = true;

	var $title = p(Dom("#theme").val() == "custom" ? "....." : Dom("#theme").val(),"title");
	$strategy.append($title);

	var $author = p("配裝器一鍵攻略@莫默墨陌", "author");
	$strategy.append($author);

	if(keywords != null){
		var $keywords_p = p("關鍵字: "+keywords, "");
		$strategy.append($keywords_p);
		Dom.each(/** @type {{ name: string, score: number }[]} */ (suits), function(){
			suitNames.push(this.name + "(" + this.score + ")");
		});
		var $suits = p("套裝: "+suitNames.join(", "), "");
		$strategy.append($suits);
	}

	var $skill_title = p("技能: ", "skill_title");
	$strategy.append($skill_title);

	if(Dom("#skillInfo").text()){
		var $skill_ops = p(Dom("#skillInfo").text().replace("公主", "        公主"), "skill_ops");
		$strategy.append($skill_ops);
	}
	else if(Dom("#theme").val().indexOf("競技場") < 0) {
		var $skill_ops = p("對手技能: ", "skill_ops");
		$strategy.append($skill_ops);
	}

	var $skill_my = p("推薦攜帶: ", "skill_my");
	if(Dom("#theme").val().indexOf("競技場") >= 0){
		$skill_my = p("推薦攜帶: 微笑 飛吻 挑剔 沉睡", "skill_my");
	}
	$strategy.append($skill_my);

	var $criteria_title = p("屬性-" + ((/** @type {Record<string, boolean>} */ (uiFilter))["balance"] ? "均衡權重" : "真實權重") + ": ", "criteria_title");
	$strategy.append($criteria_title);

	var $criteria = p(getStrCriteria(filters),"criteria");
	$strategy.append($criteria);

	var $tag = p(getstrTag(filters), "tag");
	$strategy.append($tag);

	if(Dom("#hintInfo").text()){
		var $hint = p(Dom("#hintInfo").text().replace("過關提示:",""), "hint", "過關提示: ", "hint_tiele");
		$strategy.append($hint.clone());
	}
	else if(Dom("#theme").val().indexOf("競技場") < 0 && Dom("#theme").val().indexOf("聯盟委託") < 0){
		var $hint = p("本關暫無過關提示, 若出現F, 請參考失敗後大喵的衣服提示, 或不穿外套進行嘗試", "hint", "過關提示: ", "hint_tiele");
		$strategy.append($hint);
	}

	if(Dom("#categoryFInfo").text()){
		var $F = p(Dom("#categoryFInfo").text().replace("","").replace("會導致", "  <br/>  會導致"), "hint", "", "");
		$strategy.append(Dom("#categoryFInfo").clone().attr("id", ""));
	}

	var $clotheslist_title = p("推薦搭配: ", "clotheslist_title");
	$strategy.append($clotheslist_title);

	var hierarchy = /** @type {Record<string, string[]>} */ (CATEGORY_HIERARCHY);
	for (var i in hierarchy) {
		var group = hierarchy[i];
		if (!group) continue;
		if(i == "襪子"){
			if (group[0] !== undefined) filters[group[0]] = true;
			if (group[1] !== undefined) filters[group[1]] = true;
		}
		if(i != "飾品"){
			filters[String(group)] = true;
		}
		else{
			for (var subtype of group) {
				filters[subtype] = true;
			}
		}
	}
	/** @type {StrategyResults} */
	var result = {};
	for (var i in clothes) {
		var piece = /** @type {StrategyClothing | undefined} */ (clothes[i]);
		if (!piece) continue;
		if (matches(piece, {}, filters)) {
			piece.calc(filters);
			if (piece.isF||Dom.inArray(piece.type.type,skipCategory)>=0||piece.sumScore == 0) continue;
			if (keywords != null
				&& (piece.type.type == "連身裙"
				|| piece.type.type == "上衣"
				|| piece.type.type == "下著")
			) {
				if (!result["手選" + piece.type.type]) {
					result["手選" + piece.type.type] = [];
				}
				var manual = result["手選" + piece.type.type];
				if (manual) manual.push(piece);
			}
			if (!haveKeywords(piece) && piece.type.type != "螢光之靈") continue;
			if (!result[piece.type.type]) {
				result[piece.type.type] = [];
			}
			var candidates = result[piece.type.type];
			if (candidates) candidates.push(piece);
		}
	}

	for (var r in result){
		result[r]?.sort(byActScore);
	}

	if(keywords != null){
		$strategy.append(p(getstrClothes(result["手選連身裙"]), "clothes", "手選連身裙", "clothes_category"));
		$strategy.append(p(getstrClothes(result["手選上衣"]), "clothes", "手選上衣", "clothes_category"));
		$strategy.append(p(getstrClothes(result["手選下著"]), "clothes", "手選下著", "clothes_category"));
	}
	for (var c in category){
		var name = category[c];
		if (name === undefined) continue;
		if(name.indexOf("飾品")>=0)
			continue;
		if (result[name]){
			$strategy.append(p(getstrClothes(result[name]), "clothes", name, "clothes_category"));
		}
	}

	$strategy.append(p("————————飾品(高收集佩戴滿, 低收集佩戴9件)————————", "divide"));

	for (var c in category){
		var name = category[c];
		if (name === undefined) continue;
		if(name.indexOf("飾品")<0)
			continue;
		if (result[name]) {
			var categoryContent = p(getstrClothes(result[name]), "clothes", name, "clothes_category");
			if (isGrey(name,result)) categoryContent.addClass("stgy_grey");
			$strategy.append(categoryContent);
		}
	}

	var $author_sign = Dom("<div/>").addClass("stgy_author_sign_div");
	var d = new Date();
	$author_sign.append(p("nikkiup2u3 One Key Strategy@莫默墨陌", "author_sign_name"));
	$author_sign.append(p("generate in " + d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate() + " " + d.getHours() + ":" + d.getMinutes(), "author_sign_name"));
	$strategy.append($author_sign);

	Dom("#StrategyInfo").empty().append($strategy);
}

/**
 * @param {StrategyClothing} a
 * @param {StrategyClothing} b
 */
function byActScore(a, b) {
	return actScore(a) - actScore(b) == 0 ? /** @type {number} */ (/** @type {unknown} */ (a.id)) - /** @type {number} */ (/** @type {unknown} */ (b.id)) : actScore(b) - actScore(a);
}

/**
 * @param {unknown} text
 * @param {string} cls
 * @param {string} [text2]
 * @param {string} [cls2]
 */
function p(text, cls, text2, cls2){
	var $p = Dom("<p/>").text(text).addClass("stgy_" + cls);
	if(text2){
		$p.prepend(Dom("<span/>").text(text2).addClass("stgy_" + cls2));
	}
	return $p;
}

/**
 * @param {unknown} text
 * @param {string} cls
 * @param {string} [text2]
 * @param {string} [cls2]
 */
function pspan(text, cls, text2, cls2){
	var $p = Dom("<span/>").text(text).addClass("stgy_" + cls);
	if(text2){
		$p.prepend(Dom("<span/>").text(text2).addClass("stgy_" + cls2));
	}
	return $p;
}

/**
 * @param {{ weight: FeatureWeights }} theme
 */
function ifCriteriaHighLow(theme){
	var a,b,c,d,e;
	theme.weight["simple"] >= 0 ? a = theme.weight["simple"] : a = -theme.weight["simple"];
	theme.weight["cute"] >= 0 ? b = theme.weight["cute"] : b = -theme.weight["cute"];
	theme.weight["active"] >= 0 ? c = theme.weight["active"] : c = -theme.weight["active"];
	theme.weight["pure"] >= 0 ? d = theme.weight["pure"] : d = -theme.weight["pure"];
	theme.weight["cool"] >= 0 ? e = theme.weight["cool"] : e = -theme.weight["cool"];
	var avg = (a+b+c+d+e)/5;
	var fangcha = (avg-a)*(avg-a) + (avg-b)*(avg-b) + (avg-c)*(avg-c) + (avg-d)*(avg-d) + (avg-e)*(avg-e);
}

/**
 * @param {Criteria} filters
 */
function getStrCriteria(filters){
	var weights = /** @type {FeatureWeights} */ (filters);
	var strCriteria = "";
	weights["simple"] >= 0 ? strCriteria += "簡約" : strCriteria += "華麗";
	strCriteria += " : ";
	weights["cute"] >= 0 ? strCriteria += "可愛" : strCriteria += "成熟";
	strCriteria += " : ";
	weights["active"] >= 0 ? strCriteria += "活潑" : strCriteria += "優雅";
	strCriteria += " : ";
	weights["pure"] >= 0 ? strCriteria += "清純" : strCriteria += "性感";
	strCriteria += " : ";
	weights["cool"] >= 0 ? strCriteria += "清涼" : strCriteria += "保暖";
	strCriteria += " ≈ ";
	weights["simple"] >= 0 ? strCriteria += weights["simple"] : strCriteria += -weights["simple"];
	strCriteria += " : ";
	weights["cute"] >= 0 ? strCriteria += weights["cute"] : strCriteria += -weights["cute"];
	strCriteria += " : ";
	weights["active"] >= 0 ? strCriteria += weights["active"] : strCriteria += -weights["active"];
	strCriteria += " : ";
	weights["pure"] >= 0 ? strCriteria += weights["pure"] : strCriteria += -weights["pure"];
	strCriteria += " : ";
	weights["cool"] >= 0 ? strCriteria += weights["cool"] : strCriteria += -weights["cool"];

	return strCriteria;
}

/**
 * @param {Criteria} filters
 */
function getstrTag(filters){
	var str = "";
	var bonus = /** @type {StrategyBonus[] | undefined} */ (filters.bonus);

	if(bonus && bonus[0] && bonus[0].tagWhitelist){
		str+="本關有TAG[" + bonus[0].tagWhitelist + "]，加分約" + bonus[0].param;
		if(bonus[1] && bonus[1].tagWhitelist){
			str+="，TAG[" + bonus[1].tagWhitelist + "], 加分約" + bonus[1].param;
		}
	}
	return str;
}

/**
 * @param {StrategyClothing[] | null | undefined} result
 */
function getstrClothes(result){
	if(result == null || result.length == 0)
		return " : 無";
	var str = " :";
	var max = 5;
	for(var i in result){
		var piece = result[i];
		if (!piece) continue;
		if(max > 0){
			str += " " + piece.name + "「" + actScore(piece) + " " + removeNum(piece.source) + "」" + ">";
			max--;
		}
		else if(piece.source.indexOf("少") >=0 || piece.source.indexOf("公") >= 0 || piece.source.indexOf("店") >= 0 || piece.source.indexOf("送") >= 0 ){
			str += "> " + piece.name + "「" + actScore(piece) + " " + removeNum(piece.source) + "」" + " ";
			break;
		}
	}
	 return str.slice(0, str.length-1);
}

/**
 * @param {string} str
 */
function removeNum(str){
	if (str.indexOf("定")>=0 || str.indexOf("進")>=0) str = str.replace(/[0-9]/g,"");
	str = str.replace(/聯盟·.*/, "聯盟");
	str = str.replace("設計圖", "圖");
	str = str.replace(/活動·.*/, "活動");
	str = str.replace(/套裝·.*/, "套裝");
	str = str.replace("簽到·", "簽");
	str = str.replace(/夢境·.*/, "夢境");
	str = str.replace(/儲值·.*/, "儲值");
	str = str.replace(/贈送·.*/, "贈送");
	str = str.replace("店·", "");
	str = str.replace("元素重構", "重構");
	str = str.replace("時光流轉之庭", "時光流轉");
	str = str.replace(/兌·.*/, "兌");
	str = str.replace(/.*公/, "公");
	str = str.replace(/.*少/, "少");
	return str;
}

/**
 * @param {ScoringClothing} obj
 */
function actScore(obj){
	return (obj.type.mainType=='飾品') ? ((/** @type {Record<string, boolean>} */ (uiFilter))["acc9"] ? Math.round(accSumScore(obj,9)) : Math.round(accSumScore(obj,accCateNum))) : /** @type {number} */ (obj.sumScore);
}

/**
 * @param {string} c
 * @param {StrategyResults} result
 */
function isGrey(c,result){
	for (var i in repelCates){
		var repelled = repelCates[i];
		if (!repelled) continue;
		var sumFirst=0;
		var sumOthers=0;
		if(Dom.inArray(c, repelled)>=0){
			for (var j in repelled){
				var subtype = repelled[j];
				var first = subtype === undefined ? undefined : result[subtype]?.[0];
				if (Number(j)>0) {
					if (first) sumOthers+=actScore(first);
				}else {
					if (first) sumFirst+=actScore(first);
				}
			}
			if(Dom.inArray(c, repelled)==0){
				if (sumFirst<sumOthers) return true;
			}else if(Dom.inArray(c, repelled)>0){
				if (sumOthers<sumFirst) return true;
			}
		}
	}
	return false;
}

function initOnekey(){
	Dom("#onekey").click(function() {
		Dom("#StrategyInfo").show();
		showStrategy();
		if(Dom("#onekey").text().indexOf('收起')>=0){
			Dom("#StrategyInfo").hide();
			if((/** @type {Record<string, boolean>} */ (uiFilter))["toulan"]) Dom("#onekey").text("偷懶攻略");
			else Dom("#onekey").text("一鍵攻略");
		}
		else {
			Dom("#StrategyInfo").show();
			Dom("#onekey").text("收起攻略");
		}
	});
}

var stgy_rescnt=4;
var stgy_showall=false;
function addonekey(){
	stgy_rescnt+=1;
	showStrategy();
}
function minonekey(){
	stgy_rescnt=Math.max(1,stgy_rescnt-1);
	showStrategy();
}
function onekeyshowall(){
	if (stgy_showall){stgy_showall=false;}
	else{stgy_showall=true;}
	showStrategy();
}

export {
  showStrategy, byActScore, p, pspan, ifCriteriaHighLow, getStrCriteria, getstrTag,
  getstrClothes, removeNum, actScore, isGrey, initOnekey, addonekey, minonekey, onekeyshowall
};
