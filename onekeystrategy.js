function showStrategy(keywords, suits){
	if(uiFilter["toulan"]){
		lanStrategy();
		return;
	}
	var suitNames = [];
	function haveKeywords(clothes){
		if(keywords == null){
			return true;
		}
		var strs = $.unique(clothes["name"].split(""));
		_size = strs.length + keywords.length;
		var newArray = $.merge(strs, keywords);
		size_ = $.unique(newArray).length;
		if(_size > size_)
			return true;
		return ($.inArray(clothes["isSuit"],suitNames)>=0);
	}
	
	var $strategy = $("<div/>").addClass("strategy_info_div");
		
	var theme = allThemes[$("#theme").val()];
	var filters = clone(criteria);
	filters.own = true;
	filters.missing = true;
	
	var $title = p($("#theme").val() == "custom" ? "....." : $("#theme").val(),"title");
	$strategy.append($title);
	
	var $author = p("配裝器一鍵攻略@莫默墨陌", "author");
	$strategy.append($author);
	
	if(keywords != null){
		var $keywords_p = p("關鍵字: "+keywords, "");
		$strategy.append($keywords_p);
		$.each(suits, function(){
			suitNames.push(this.name + "(" + this.score + ")");
		});
		var $suits = p("套裝: "+suitNames.join(", "), "");
		$strategy.append($suits);
	}
	
	var $skill_title = p("技能: ", "skill_title");
	$strategy.append($skill_title);
	
	if($("#skillInfo").text()){
		var $skill_ops = p($("#skillInfo").text().replace("公主", "        公主"), "skill_ops");
		$strategy.append($skill_ops);
	}
	else if($("#theme").val().indexOf("競技場") < 0) {
		var $skill_ops = p("對手技能: ", "skill_ops");
		$strategy.append($skill_ops);		
	}
	
	var $skill_my = p("推薦攜帶: ", "skill_my");
	if($("#theme").val().indexOf("競技場") >= 0){
		$skill_my = p("推薦攜帶: 微笑 飛吻 挑剔 沉睡", "skill_my");
	}
	$strategy.append($skill_my);
	
	var $criteria_title = p("屬性-" + (uiFilter["balance"] ? "均衡權重" : "真實權重") + ": ", "criteria_title");
	$strategy.append($criteria_title);
	
	var $criteria = p(getStrCriteria(filters),"criteria");
	$strategy.append($criteria);
	
	var $tag = p(getstrTag(filters), "tag");
	$strategy.append($tag);
	
	if($("#hintInfo").text()){
		var $hint = p($("#hintInfo").text().replace("過關提示:",""), "hint", "過關提示: ", "hint_tiele");
		$strategy.append($hint.clone());
	}
	else if($("#theme").val().indexOf("競技場") < 0 && $("#theme").val().indexOf("聯盟委託") < 0){
		var $hint = p("本關暫無過關提示, 若出現F, 請參考失敗後大喵的衣服提示, 或不穿外套進行嘗試", "hint", "過關提示: ", "hint_tiele");
		$strategy.append($hint);
	}
	
	if($("#categoryFInfo").text()){
		var $F = p($("#categoryFInfo").text().replace("","").replace("會導致", "  <br/>  會導致"), "hint", "", "");
		$strategy.append($("#categoryFInfo").clone().attr("id", ""));
	}
		
	var $clotheslist_title = p("推薦搭配: ", "clotheslist_title");
	$strategy.append($clotheslist_title);
	
	for (var i in CATEGORY_HIERARCHY) {
		if(i == "襪子"){
			filters[CATEGORY_HIERARCHY[i][0]] = true;	
			filters[CATEGORY_HIERARCHY[i][1]] = true;	
		}
		if(i != "飾品"){
			filters[CATEGORY_HIERARCHY[i]] = true;	
		}
		else{
			for (var j in CATEGORY_HIERARCHY[i]) {
				filters[CATEGORY_HIERARCHY[i][j]] = true;
			}			
		}
	}
	var result = {};
	for (var i in clothes) {		
		if (matches(clothes[i], {}, filters)) {
			clothes[i].calc(filters);
			if (clothes[i].isF||$.inArray(clothes[i].type.type,skipCategory)>=0||clothes[i].sumScore == 0) continue;
			if (keywords != null 
				&& (clothes[i].type.type == "連身裙"
				|| clothes[i].type.type == "上衣"
				|| clothes[i].type.type == "下著")
			) {
				if (!result["手選" + clothes[i].type.type]) {
					result["手選" + clothes[i].type.type] = [];
				}
				result["手選" + clothes[i].type.type].push(clothes[i]);
			}
			if (!haveKeywords(clothes[i]) && clothes[i].type.type != "螢光之靈") continue;
			if (!result[clothes[i].type.type]) {
				result[clothes[i].type.type] = [];
			}
			result[clothes[i].type.type].push(clothes[i]);
		}
	}	
	
	for (var r in result){
		result[r].sort(byActScore);
	}
	
	if(keywords != null){
		$strategy.append(p(getstrClothes(result["手選連身裙"]), "clothes", "手選連身裙", "clothes_category"));
		$strategy.append(p(getstrClothes(result["手選上衣"]), "clothes", "手選上衣", "clothes_category"));	
		$strategy.append(p(getstrClothes(result["手選下著"]), "clothes", "手選下著", "clothes_category"));
	}
	for (var c in category){
		var name = category[c];
		if(name.indexOf("飾品")>=0)
			continue;
		if (result[name]){
			$strategy.append(p(getstrClothes(result[name]), "clothes", name, "clothes_category"));
		}
	}
	
	$strategy.append(p("————————飾品(高收集佩戴滿, 低收集佩戴9件)————————", "divide"));
	
	for (var c in category){
		var name = category[c];
		if(name.indexOf("飾品")<0)
			continue;
		if (result[name]) {
			var categoryContent = p(getstrClothes(result[name]), "clothes", name, "clothes_category");
			if (isGrey(name,result)) categoryContent.addClass("stgy_grey");
			$strategy.append(categoryContent);
		}
	}

	$author_sign = $("<div/>").addClass("stgy_author_sign_div");
	var d = new Date();
	$author_sign.append(p("nikkiup2u3 One Key Strategy@莫默墨陌", "author_sign_name"));
	$author_sign.append(p("generate in " + (1900+d.getYear()) + "-" + (d.getMonth() + 1) + "-" + d.getDate() + " " + d.getHours() + ":" + d.getMinutes(), "author_sign_name"));
	$strategy.append($author_sign);
	
	$("#StrategyInfo").empty().append($strategy);
}

function byActScore(a, b) {
	return actScore(a) - actScore(b) == 0 ? a.id - b.id : actScore(b) - actScore(a);
}

function p(text, cls, text2, cls2){
	var $p = $("<p/>").text(text).addClass("stgy_" + cls);
	if(text2){
		$p.prepend($("<span/>").text(text2).addClass("stgy_" + cls2));
	}
	return $p;
}

function pspan(text, cls, text2, cls2){
	var $p = $("<span/>").text(text).addClass("stgy_" + cls);
	if(text2){
		$p.prepend($("<span/>").text(text2).addClass("stgy_" + cls2));
	}
	return $p;
}

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

function getStrCriteria(filters){
	var strCriteria = "";
	filters["simple"] >= 0 ? strCriteria += "簡約" : strCriteria += "華麗";
	strCriteria += " : ";
	filters["cute"] >= 0 ? strCriteria += "可愛" : strCriteria += "成熟";
	strCriteria += " : ";
	filters["active"] >= 0 ? strCriteria += "活潑" : strCriteria += "優雅";
	strCriteria += " : ";
	filters["pure"] >= 0 ? strCriteria += "清純" : strCriteria += "性感";
	strCriteria += " : ";
	filters["cool"] >= 0 ? strCriteria += "清涼" : strCriteria += "保暖";
	strCriteria += " ≈ ";
	filters["simple"] >= 0 ? strCriteria += filters["simple"] : strCriteria += -filters["simple"];
	strCriteria += " : ";
	filters["cute"] >= 0 ? strCriteria += filters["cute"] : strCriteria += -filters["cute"];
	strCriteria += " : ";
	filters["active"] >= 0 ? strCriteria += filters["active"] : strCriteria += -filters["active"];
	strCriteria += " : ";
	filters["pure"] >= 0 ? strCriteria += filters["pure"] : strCriteria += -filters["pure"];
	strCriteria += " : ";
	filters["cool"] >= 0 ? strCriteria += filters["cool"] : strCriteria += -filters["cool"];
	
	return strCriteria;
}

function getstrTag(filters){
	var str = "";
	
	if(filters.bonus && filters.bonus[0] && filters.bonus[0].tagWhitelist){
		str+="本關有TAG[" + filters.bonus[0].tagWhitelist + "]，加分約" + filters.bonus[0].param;
		if(filters.bonus[1] && filters.bonus[1].tagWhitelist){
			str+="，TAG[" + filters.bonus[1].tagWhitelist + "], 加分約" + filters.bonus[1].param;
		}
	}
	return str;
}

function getstrClothes(result){
	if(result == null || result.length == 0)
		return " : 無";
	var str = " :";
	var max = 5;
	for(var i in result){
		if(max > 0){
			str += " <span class='copy-btn' onclick='copyClothesName(\"" + result[i].name + "\")' title='複製服裝名稱'>📋</span> " + result[i].name + "「" + actScore(result[i]) + " " + removeNum(result[i].source) + "」" + ">";		
			max--;
		}
		else if(result[i].source.indexOf("少") >=0 || result[i].source.indexOf("公") >= 0 || result[i].source.indexOf("店") >= 0 || result[i].source.indexOf("送") >= 0 ){
			str += "> <span class='copy-btn' onclick='copyClothesName(\"" + result[i].name + "\")' title='複製服裝名稱'>📋</span> " + result[i].name + "「" + actScore(result[i]) + " " + removeNum(result[i].source) + "」" + " ";
			break;
		}
	}
	 return str.slice(0, str.length-1);
}

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

function actScore(obj){
	return (obj.type.mainType=='飾品') ? (uiFilter["acc9"] ? Math.round(accSumScore(obj,9)) : Math.round(accSumScore(obj,accCateNum))) : obj.sumScore;
}

function isGrey(c,result){
	for (var i in repelCates){
		var sumFirst=0;
		var sumOthers=0;
		if($.inArray(c, repelCates[i])>=0){
			for (var j in repelCates[i]){
				if (j>0) {
					if (result[repelCates[i][j]]&&result[repelCates[i][j]][0]) sumOthers+=actScore(result[repelCates[i][j]][0]);
				}else {
					if (result[repelCates[i][j]]&&result[repelCates[i][j]][0]) sumFirst+=actScore(result[repelCates[i][j]][0]);
				}
			}
			if($.inArray(c, repelCates[i])==0){
				if (sumFirst<sumOthers) return true;
			}else if($.inArray(c, repelCates[i])>0){
				if (sumOthers<sumFirst) return true;
			}
		}
	}
	return false;
}

function initOnekey(){
	$("#onekey").click(function() {
		$("#StrategyInfo").show();
		showStrategy();
		if($("#onekey").text().indexOf('收起')>=0){
			$("#StrategyInfo").hide();
			if(uiFilter["toulan"]) $("#onekey").text("偷懶攻略");
			else $("#onekey").text("一鍵攻略");
		}
		else {
			$("#StrategyInfo").show();
			$("#onekey").text("收起攻略");
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

function copyClothesName(clothesName) {
	// 使用现代浏览器的 Clipboard API
	if (navigator.clipboard && window.isSecureContext) {
		navigator.clipboard.writeText(clothesName).then(function() {
			showCopySuccess(clothesName);
		}).catch(function(err) {
			console.error('复制失败: ', err);
			fallbackCopyTextToClipboard(clothesName);
		});
	} else {
		// 降级方案，使用传统的 document.execCommand
		fallbackCopyTextToClipboard(clothesName);
	}
}

function fallbackCopyTextToClipboard(text) {
	var textArea = document.createElement("textarea");
	textArea.value = text;
	
	// 避免滚动到底部
	textArea.style.top = "0";
	textArea.style.left = "0";
	textArea.style.position = "fixed";
	
	document.body.appendChild(textArea);
	textArea.focus();
	textArea.select();
	
	try {
		var successful = document.execCommand('copy');
		if (successful) {
			showCopySuccess(text);
		} else {
			showCopyError();
		}
	} catch (err) {
		console.error('降级复制失败: ', err);
		showCopyError();
	}
	
	document.body.removeChild(textArea);
}

function showCopySuccess(clothesName) {
	// 创建临时提示元素
	var toast = document.createElement('div');
	toast.className = 'copy-toast copy-success';
	toast.textContent = '已複製: ' + clothesName;
	toast.style.cssText = `
		position: fixed;
		top: 20px;
		right: 20px;
		background: #4CAF50;
		color: white;
		padding: 10px 15px;
		border-radius: 4px;
		z-index: 10000;
		font-size: 14px;
		box-shadow: 0 2px 5px rgba(0,0,0,0.2);
	`;
	
	document.body.appendChild(toast);
	
	// 2秒后自动移除
	setTimeout(function() {
		if (toast.parentNode) {
			toast.parentNode.removeChild(toast);
		}
	}, 2000);
}

function showCopyError() {
	// 创建错误提示元素
	var toast = document.createElement('div');
	toast.className = 'copy-toast copy-error';
	toast.textContent = '複製失敗，請手動複製';
	toast.style.cssText = `
		position: fixed;
		top: 20px;
		right: 20px;
		background: #f44336;
		color: white;
		padding: 10px 15px;
		border-radius: 4px;
		z-index: 10000;
		font-size: 14px;
		box-shadow: 0 2px 5px rgba(0,0,0,0.2);
	`;
	
	document.body.appendChild(toast);
	
	// 2秒后自动移除
	setTimeout(function() {
		if (toast.parentNode) {
			toast.parentNode.removeChild(toast);
		}
	}, 2000);
}
