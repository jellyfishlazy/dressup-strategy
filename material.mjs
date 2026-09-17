import { clothes as modelClothes, clothesSet as modelClothesSet, calcDependencies, loadFromStorage, loadNew, load, save } from './material_model.mjs';

/** @typedef {import('./src/domain/scoring/types.d.ts').ScoringClothing & { set: string, stars: string | number }} MaterialClothing */
/** @typedef {Record<string, any>} LegacyDict */
/** @typedef {[MaterialClothing, string, string]} StarDrop */
/** @typedef {string | number} MaterialId */
/** @typedef {[string, string, string, string, string | number, string]} MaterialPatternRow */
/** @typedef {[string, string]} MaterialSetCategoryRow */
/** @typedef {[string, string, string, string, number]} MaterialConvertRow */
/** @typedef {[string, string, string, number]} MaterialConstructRow */
/** @typedef {[string, string, number, string, number?]} MaterialMerchantRow */
/** @typedef {[number, number]} MaterialConvertPrice */
/** @typedef {[string, string, number]} MaterialPatternPriceRow */

// Typed model collections keep their identity; recipe algorithms retain explicit dense legacy views.
/** @type {MaterialClothing[]} */
const clothes = modelClothes;
/** @type {LegacyDict} */
const clothesSet = modelClothesSet;

/** @type {import('./src/legacy/native-dom-types.d.ts').DomFacade} */
const Dom = /** @type {typeof globalThis & { Dom: import('./src/legacy/native-dom-types.d.ts').DomFacade }} */ (globalThis).Dom;
const MaterialActions = /** @type {typeof globalThis & { MaterialActions: { register(actions: Record<string, (...args: never[]) => unknown>): void } }} */ (globalThis).MaterialActions;
const html2canvas = /** @type {typeof globalThis & { html2canvas: (element: HTMLElement, options: { onrendered(canvas: HTMLCanvasElement): void }) => void }} */ (globalThis).html2canvas;
const category = /** @type {typeof globalThis & { category: string[] }} */ (globalThis).category;
const patternSource = /** @type {typeof globalThis & { pattern: MaterialPatternRow[] }} */ (globalThis).pattern;
/** @type {LegacyDict} */
const pattern = patternSource;
const setcategorySource = /** @type {typeof globalThis & { setcategory: MaterialSetCategoryRow[] }} */ (globalThis).setcategory;
/** @type {LegacyDict} */
const setcategory = setcategorySource;
const convertSource = /** @type {typeof globalThis & { convert: MaterialConvertRow[] }} */ (globalThis).convert;
/** @type {LegacyDict} */
const convert = convertSource;
const constructSource = /** @type {typeof globalThis & { construct: MaterialConstructRow[] }} */ (globalThis).construct;
/** @type {LegacyDict} */
const construct = constructSource;
const merchantSource = /** @type {typeof globalThis & { merchant: MaterialMerchantRow[] }} */ (globalThis).merchant;
/** @type {LegacyDict} */
const merchant = merchantSource;
const convertPriceSource = /** @type {typeof globalThis & { convertPrice: Record<string, MaterialConvertPrice> }} */ (globalThis).convertPrice;
/** @type {LegacyDict} */
const convertPrice = convertPriceSource;
const constructMaterialName = /** @type {typeof globalThis & { constructMaterialName: string[] }} */ (globalThis).constructMaterialName;
const patternPriceSource = /** @type {typeof globalThis & { patternPrice: MaterialPatternPriceRow[] }} */ (globalThis).patternPrice;
/** @type {LegacyDict} */
const patternPrice = patternPriceSource;
var highlight=['星之海','韶顏傾城','格萊斯','冰風戰歌','白櫻戀歌'];
var highlight_style=['xzh','syqc','gls','bfzg','bylg'];

var src=['公','少','店·金幣,店·鑽石,店','設計圖','重構','抽·,禮盒·','兌·,聯盟·','']; //note:'重構'&'聯盟·小鋪' are hardcoded in function
var src_desc = ['公主級掉落','少女級掉落','商店購買','設計圖','重構','謎之屋','兌換','其它']; //note:'謎之屋','兌換' is hardcoded in function
/** @type {string[]} */
var chapList = [];
/** @type {number[]} */
var reqCnt=[];
/** @type {number[]} */
var parentInd=[];
/** @type {number[]} */
var extraInd=[];
/** @type {number[]} */
var extraAdded=[];
/** @type {number[]} */
var shownFactor=[];
/** @type {string[]} */
var convertlist=[];
/** @type {number[]} */
var convertlistCnt=[];
/** @type {string[]} */
var allSetInCate=[];
/** @type {MaterialId[]} */
var cartCont=[];

var highlight_parts = function(){
	/** @type {Record<string, string[]>} */
	var ret = {};
	/** @type {Record<string, string[]>} */
	var highlight_id = {};
	for (var i in highlight){
		var setName = highlight[i];
		if (setName === undefined) continue;
		/** @type {string[]} */
		const parts = ret[setName] = [];
		/** @type {string[]} */
		const ids = highlight_id[setName] = [];
		for (var c in clothes){
			const clothing = clothes[c];
			if (clothing === undefined) continue;
			if (clothing.set == setName) {
				parts.push(clothing.name);
				ids.push(clothing.type.mainType+clothing.id);
			}
		}
		for (var c in clothes){//search for dye once only
			const clothing = clothes[c];
			if (clothing === undefined) continue;
			if (clothing.source.indexOf('定')==0){
				var cl = clothing.type.mainType+clothing.source.replace('定','');
				if (Dom.inArray(cl,ids)>=0) parts.push(clothing.name);
			}
		}
	}
	return ret;
}();

function show_scope(){
	Dom("#chooseSub2").html('');
	var chooseScope='';
	chooseScope+=selectBox("selectScope","chgScope()",[1,2,3,4],['按關卡','按套裝','按部件','按星級']);
	chooseScope+='&ensp;-&ensp;'
	Dom("#chooseScope").html(chooseScope);
	chgScope();
}

function chgScope(){
	Dom("#levelDropInfo").html('');
	Dom("#levelDropNote").html('');
	Dom("#downloadimage").html('');
	
	var chooseLevel='';
	switch(Dom("#selectScope").val()){
		case '1':
			chooseLevel+=selectBox("degree_level","showLevelDropInfo()",['公','少'],['公主','少女']);
			chooseLevel+='&ensp;-&ensp;';
			/** @type {(string | number)[]} */
			var chapVal=[0];var chapText=['請選擇章節'];
			for(var i=0; i<chapList.length; i++){
				const chapter = chapList[i];
				if (chapter === undefined) continue;
				chapVal.push(chapter);
				chapText.push('第'+chapList[i]+'章');
			}
			if(chapList.length>0) {
				chapVal.push(-1);
				chapText.push('尚缺材料');
			}
			chooseLevel+=selectBox("level_select","showLevelDropInfo()",chapVal,chapText);
			chooseLevel+=ahref('&#x1f50d;','showLevelDropInfo()','search');
			Dom("#chooseLevel").html(chooseLevel);
			Dom("#chooseSub").html('');
			break;
		case '2':
			var catelist=[];
			allSetInCate=[];
			for (var setIndex in setcategory){
				if(Dom.inArray(setcategory[setIndex][0], catelist)<0){
					catelist.push(setcategory[setIndex][0]);
				}
				allSetInCate.push(setcategory[setIndex][1]);
			}
			for (var c in clothes){//add any set not listed to undefined
				const clothing = clothes[c];
				if (clothing === undefined) continue;
				if(clothing.set&&Dom.inArray(clothing.set, allSetInCate)<0){
					catelist.push('-未分類-'); break;
				}
			}
			catelist.unshift('自訂');
			chooseLevel+=selectBox("degree_level","chooseSet()",catelist,catelist);
			Dom("#chooseLevel").html(chooseLevel);
			chooseSet();
			break;
		case '3': 
			//20160304: move 3-setSearch into chgScope-'2'
			chapVal=[0,4,1,2];var chapText=['自訂','特殊屬性','設計圖','進化'];
			chooseLevel+=selectBox("degree_level","chgScopeSub()",chapVal,chapText);
			Dom("#chooseLevel").html(chooseLevel);
			chgScopeSub();
			break;
		case '4': 
			var starValues=[]; var starTexts=[];
			for (var c in clothes){
				const clothing = clothes[c];
				if (clothing === undefined) continue;
				if(Dom.inArray(clothing.stars, starValues)<0){
					starValues.push(clothing.stars);
				}
			}
			starValues.sort(function(a,b){return Number(b) - Number(a)});
			for (var starIndex in starValues) starTexts.push(starValues[starIndex]+'星');
			chooseLevel+=selectBox("degree_level","chgStars()",starValues,starTexts);
			Dom("#chooseLevel").html(chooseLevel);
			chgStars();
			break;
	}
}

function chooseSet(){
	var cate=Dom("#degree_level").val();
	var setlist=[];
	var chooseSub = '&ensp;-&ensp;';
	if(cate=='自訂'){
		chooseSub += '<input type="text" style="line-height:100%;" id="searchById" placeholder="輸入套裝名搜索" />';
		chooseSub += ahref('&#x1f50d;','searchBySetId()','search');
		Dom("#chooseSub").html(chooseSub);
		enterKey();
	}else {
		if(cate.substr(0,1)!='-'){
			for (var setIndex in setcategory){
				if(setcategory[setIndex][0]==cate){
					setlist.push(setcategory[setIndex][1]);
				}
			}
		}else{
			for (var c in clothes){//any set not listed
				const clothing = clothes[c];
				if (clothing === undefined) continue;
				if(clothing.set&&Dom.inArray(clothing.set, allSetInCate)<0){
					setlist.push(clothing.set);
				}
			}
		}
		setlist=getDistinct(setlist);
		//setlist.sort();
		setlist.unshift('請選擇');
		//var chooseSub='&ensp;-&ensp;';
		chooseSub+=selectBox('searchSetMain','searchSetMain()',setlist,setlist);
		chooseSub+=ahref('&#x1f50d;','searchSetMain()','search');
		Dom("#chooseSub").html(chooseSub);
		searchSetMain();
	}
}

function searchSetMain(){
	var setName=Dom("#searchSetMain").val();
	chgScopeSub2(3,setName);
}

function searchBySetId(){
	var levelDropNote = '';
	var searchById = Dom.trim(Dom("#searchById").val());
	var searchBySetName = [];
	if(searchById){
		var levelDropInfo = '查找：'+searchById;
		levelDropNote = table()+tr(tab('套裝')+tab('分類'),'style="font-weight:bold;"');
		for (var c in clothes){
			const clothing = clothes[c];
			if (clothing === undefined) continue;
			if(clothing.set && clothing.set.indexOf(searchById)>=0 && Dom.inArray(clothing.set, searchBySetName)<0){
				searchBySetName.push(clothing.set);
			}
		}
		for (var setIndex in setcategory){
			for (var j in searchBySetName){
				if (setcategory[setIndex][1] == searchBySetName[j])
					levelDropNote += tr(tab(ahref(setcategory[setIndex][1],"chgScopeSub2(3,'"+setcategory[setIndex][1]+"')"))+tab(setcategory[setIndex][0]));
			}
		}
		for (var j in searchBySetName){
			const setName = searchBySetName[j];
			if (setName === undefined) continue;
			if (Dom.inArray(searchBySetName[j], allSetInCate)<0)
				levelDropNote += tr(tab(ahref(setName,"chgScopeSub2(3,'"+searchBySetName[j]+"')"))+tab('(未分類)'));
		}
		levelDropNote += table(1);
		Dom("#levelDropInfo").html(levelDropInfo);
		if(searchBySetName) Dom("#levelDropNote").html(levelDropNote);
		else Dom("#levelDropNote").html('沒有找到相關資料');
	}
}

function chgScopeSub(){
	Dom("#levelDropInfo").html('');
	Dom("#levelDropNote").html('');
	Dom("#downloadimage").html('');

	var j=Dom("#degree_level").val();
	var chooseSub='&ensp;-&ensp;';
	if(j==0){
		chooseSub+='<input type="text" style="line-height:100%;" id="searchById" placeholder="輸入名字或編號搜索" />';
		chooseSub+=ahref('&#x1f50d;','searchById()','search');
		Dom("#chooseSub").html(chooseSub);
		enterKey();
	}
	else{
		/** @type {string[]} */
		var selectArr=[];
		if (j==1){
			for(var i in category){
				for(var c in clothes){
					const clothing = clothes[c];
					if (clothing === undefined) continue;
					if(clothing.type.type==category[i]&&clothing.source.indexOf('設')>-1) {
						selectArr.push(clothing.type.type);
						break;
					}
				}
			}
		}else if (j==2){
			for(var i in category){
				for(var c in clothes){
					const clothing = clothes[c];
					if (clothing === undefined) continue;
					if(clothing.type.type==category[i]&&clothing.source.indexOf('進')>-1) {
						selectArr.push(clothing.type.type);
						break;
					}
				}
			}
		}else if(j==3){//design&evo > others
			var tmpArr1=[];
			for(var c in clothes){
				const clothing = clothes[c];
				if (clothing === undefined) continue;
				if(clothing.set&&(clothing.source.indexOf('設')>-1||clothing.source.indexOf('進')>-1)){
					tmpArr1.push(clothing.set);
				}
			}
			selectArr=getDistinct(tmpArr1);
			selectArr.sort();
			tmpArr1=[];
			for(var c in clothes){
				const clothing = clothes[c];
				if (clothing === undefined) continue;
				if(clothing.set&&Dom.inArray(clothing.set, selectArr)<0){
					tmpArr1.push(clothing.set);
				}
			}
			tmpArr1=getDistinct(tmpArr1);
			tmpArr1.sort();
			selectArr=selectArr.concat(tmpArr1);
		}else if(j==4){
			for(var c in clothes){
				const clothing = clothes[c];
				if (clothing === undefined) continue;
				if(clothing.type.type=='螢光之靈') continue;
				if(clothing.tags[0]){
					for (var tag in clothing.tags){
						const tagName = clothing.tags[tag];
						if (tagName !== undefined) selectArr.push(tagName);
					}
				}
			}
			selectArr=getDistinct(selectArr);
			selectArr.sort();
		}
		selectArr.unshift('請選擇');
		chooseSub+=selectBox('chooseCate','chgScopeSub2()',selectArr,selectArr);
		chooseSub+=ahref('&#x1f50d;','chgScopeSub2()','search');
		Dom("#chooseSub").html(chooseSub);
		chgScopeSub2();
	}
}

/** @param {number} [j] @param {string} [k] @param {number} [l] */
function chgScopeSub2(j,k,l){
	if(!j) j = Number(Dom("#degree_level").val());
	if(!k) k = Dom("#chooseCate").val();
	if (k === undefined) return;

	var valArr=[];
	var levelDropInfo='';
	var levelDropNote='';
	if (j==1){
		for(var i in clothes){
			const clothing = clothes[i];
			if (clothing === undefined) continue;
			if(clothing.type.type==k&&clothing.source.indexOf('設')>-1){
				valArr.push(i);
			}
		}
	}else if(j==2){
		for(var i in clothes){
			const clothing = clothes[i];
			if (clothing === undefined) continue;
			if(clothing.type.type==k&&clothing.source.indexOf('進')>-1){
				valArr.push(i);
			}
		}
	}else if(j==3){
		for(var i in clothes){
			const clothing = clothes[i];
			if (clothing === undefined) continue;
			if(clothing.set==k){
				valArr.push(i);
			}
		}
		if(l){//count for dye
			var dyeArr=[];
			for(var a in valArr){
				const clothingId = valArr[a];
				if (clothingId === undefined) continue;
				for(var p in pattern){
					if(pattern[p][5]=='染'&&clothesSet[pattern[p][0]][pattern[p][1]]==clothes[Number(clothingId)]) dyeArr.push(pattern[p][2]+','+pattern[p][3]);
					if(pattern[p][5]=='染'&&clothesSet[pattern[p][2]][pattern[p][3]]==clothes[Number(clothingId)]) dyeArr.push(pattern[p][0]+','+pattern[p][1]);
				}
			}
			for(var d in dyeArr){
				const dye = dyeArr[d];
				if (dye === undefined) continue;
				var dd=dye.split(',');
				for(var i in clothes){
					const clothing = clothes[i];
					if (clothing === undefined) continue;
					if(clothing.type.mainType==dd[0]&&clothing.id==dd[1]){
						valArr.push(i);
						break;
					}
				}
			}
			valArr=getDistinct(valArr);
		}
	}else if(j==4){
		for(var i in clothes){
			const clothing = clothes[i];
			if (clothing === undefined) continue;
			if(clothing.tags[0]){
				for (var tag in clothing.tags){
					if(clothing.tags[tag]==k){
						valArr.push(i);
					}
				}
			}
		}
	}
	
	if (valArr.length>0){
		var j_txt=(j<=2) ? Dom("#degree_level option[value='"+j+"']").text()+'&ensp;-&ensp;' : '';//given now j<=2 only invoked by selectbox
		var set_link=(j==3&&!l)? (hvConvert(k)?ahref('[染色]',"chgScopeSub2(3,'"+k+"',1)"):'')+'　'+ahref('套裝材料總覽',"searchSet('"+k+"')") : '';
		var cart_button='&ensp;'+cartButton("addCartList('"+valArr.join('/')+"')");
		var levelDropInfo='查找：'+j_txt+k+set_link+cart_button;
		var levelDropNote=table()+tr(tab('名稱')+tab('分類')+tab('編號')+tab('來源')+tab(''),'style="font-weight:bold;"');
		for (var c in category){//sort by category
			if(j<=2&&category[c]!=k) continue;//if j<=2 skip other categories
			for (var i in clothes){
				const clothing = clothes[i];
				if (clothing === undefined) continue;
				if(Dom.inArray(i,valArr)>-1&&clothing.type.type==category[c]){
					var line=tab(ahref(clothing.name,'genFactor('+i+')'));
						line+=tab(clothing.type.type);
						line+=tab(clothing.id);
						var srcs = conv_source(clothing.source, clothing.type.mainType);
						line+=tab(srcs);
						line+=tab(cartButton('addCart('+i+')'));
					levelDropNote+=tr(line);
				}
			}
		}
		levelDropNote+=table(1);
	}else{
		if(k.indexOf('請選擇')<0) var levelDropNote = '沒有找到相關資料';
	}
	Dom("#levelDropInfo").html(levelDropInfo? levelDropInfo:'');
	Dom("#levelDropNote").html(levelDropNote? levelDropNote:'');
	Dom("#downloadimage").html(imageButton());
}

function chgStars(){
	Dom("#levelDropInfo").html('');
	Dom("#levelDropNote").html('');
	Dom("#downloadimage").html('');

	var j=Dom("#degree_level").val();
	var chooseSub='&ensp;-&ensp;';
	
	/** @type {string[]} */
	var selectArr=[];
	for (var i in clothes){
		const clothing = clothes[i];
		if (clothing === undefined) continue;
		if(clothing.stars==j){
			for (let sourceIndex = 0; sourceIndex < src_desc.length; sourceIndex++){
				const sourceDescription = src_desc[sourceIndex];
				const sourceRule = src[sourceIndex];
				if (sourceDescription === undefined || sourceRule === undefined) continue;
				if (sourceDescription.indexOf('重構')>-1) continue;
				for (let ss = 0; ss < sourceRule.length; ss++){
					if(clothing.source.indexOf(sourceRule[ss] ?? '')>-1){
						selectArr.push(sourceDescription);
						break;
					}
				}
			}
		}
	}
	selectArr=getDistinct(selectArr);
	selectArr.sort(function(a,b){return Dom.inArray(a,src_desc) - Dom.inArray(b,src_desc)});
	selectArr.unshift('請選擇');
	chooseSub+=selectBox('chooseCate','chgStars2()',selectArr,selectArr);
	chooseSub+=ahref('&#x1f50d;','chgStars2()','search');
	Dom("#chooseSub").html(chooseSub);
	chgStars2();
}

function chgStars2(){
	var j, k, l, l1;
	var levelDropInfo='';
	Dom("#levelDropInfo").html('');
	Dom("#levelDropNote").html('');
	Dom("#downloadimage").html('');
	
	j=Dom("#degree_level").val();
	k=Dom("#chooseCate").val();
	
	var kp=Dom.inArray(k,src_desc);
	if(kp>-1){
		var sourceRule = src[kp];
		if (sourceRule === undefined) return;
		var srcs=sourceRule.split(',');
		/** @type {StarDrop[]} */
		var outStars2=[];
		for (var i in clothes){
			const clothing = clothes[i];
			if (clothing === undefined) continue;
			if(clothing.stars!=j) continue;
			var thisSrc=clothing.source;
			for (var s in srcs){
				const sourcePart = srcs[s];
				if (sourcePart === undefined) continue;
				//note: hardcoded skip part of '聯盟·小鋪' & '謎之屋'
				if(sourcePart=='聯盟·小鋪'&&thisSrc!=sourcePart) continue;
				if(k=='謎之屋'&&(thisSrc.indexOf('店')>-1||thisSrc.indexOf('進')>-1||thisSrc.indexOf('公')>-1||thisSrc.indexOf('少')>-1)) continue;
				if(thisSrc.indexOf(sourcePart)>-1) {outStars2.push([clothing,sourcePart,i]);break;}
			}
		}
		if(kp<2){
			/** @type {StarDrop[]} */
			var outStars2tmp=[];
			for (l1=0; l1<chapList.length; l1++){
				for (l=1;l<30;l++){//sort by level
					/** @type {string | number} */
					var l2=l;
					if(l>20) l2 = "支"+l%10;
					for (var i in outStars2){
						const starDrop = outStars2[i];
						if (starDrop === undefined) continue;
						var src_sp=starDrop[0].source.split("/");
						for (var ss in src_sp){
							const sourcePart = src_sp[ss];
							if (sourcePart === undefined) continue;
							if(sourcePart==chapList[l1]+'-'+l2+sourceRule){
								outStars2tmp.push([starDrop[0],sourcePart,starDrop[2]]);
								break;
							}
						}
					}
				}
			}
			outStars2=outStars2tmp;
		}else{
			//first by source position, then by source, last by clothes type
			if (k=='兌換') outStars2.sort(function(a,b){return Dom.inArray(a[1],srcs)==Dom.inArray(b[1],srcs) ? ( a[0].source==b[0].source ? Dom.inArray(a[0].type.type,category)-Dom.inArray(b[0].type.type,category) : compareStr(a[0].source,b[0].source) ) : Dom.inArray(a[1],srcs)-Dom.inArray(b[1],srcs)})
			//first by source position, then by clothes type
			else outStars2.sort(function(a,b){return Dom.inArray(a[1],srcs)==Dom.inArray(b[1],srcs) ? Dom.inArray(a[0].type.type,category)-Dom.inArray(b[0].type.type,category) : Dom.inArray(a[1],srcs)-Dom.inArray(b[1],srcs)})
		}
		if(outStars2.length>0){
			var levelDropInfo=table()+tr(tab('名稱')+tab('來源')+tab('部位')+tab('材料需求統計'),'style="font-weight:bold;"');
			for (var i in outStars2){
				const starDrop = outStars2[i];
				if (starDrop === undefined) continue;
				var thisDeps=addhighlightdeps(starDrop[2]);
				var thisName=ahref((thisDeps[1]?thisDeps[1]:starDrop[0].name),'genFactor('+starDrop[2]+')','inherit');
				var thisSrc=starDrop[0].source;
				var thisPrice=getMerc(starDrop[0]);
				if(thisPrice) thisSrc += '<br>('+thisPrice[1]+thisPrice[0]+')';
				thisSrc=kp<2?starDrop[1]:thisSrc;
				var thisType=starDrop[0].type.mainType;
				levelDropInfo+=tr(tab(thisName)+tab(thisSrc)+tab(thisType)+tab(thisDeps[0], 'class="level_drop_cnt"'));
			}
			levelDropInfo+=table(1);
		}
		var levelDropNote='';
		for (var h in highlight){
			if(Number(h)>0){levelDropNote+='&ensp;/&ensp;';}
			levelDropNote+=span(highlight[h]+'材料',highlight_style[h]);
		}
		Dom("#levelDropInfo").html(levelDropInfo);
		Dom("#levelDropNote").html(levelDropNote);
		Dom("#downloadimage").html(imageButton());

	}
}

/** @param {string} str1 @param {string} str2 */
function compareStr(str1,str2){
	if (str1 < str2) return -1;
	if (str1 > str2) return 1;
	return 0;
}

function showFactorInfo(){
	var t=Dom("#chooseItem").val();
	if(t=='na'){
		Dom("#levelDropInfo").html('');
		Dom("#levelDropNote").html('');
		Dom("#downloadimage").html('');
	}
	else genFactor(t);
}

/** @param {MaterialId} i @returns {[string, string]} */
function addhighlightdeps(i){
	const clothing = clothes[Number(i)];
	if (!clothing) return ['', ''];
	var deps1=clothing.getDeps('   ', 1);
	var deps=add_genFac(deps1,1);
	var item='';
	
	for (var h in highlight){
		const setName = highlight[h];
		if (setName === undefined) continue;
		if(getLastIndexHL(deps1,setName)>-1){
			var style=highlight_style[h];
			var ind=getLastIndexHL(deps,setName);
			while(ind>-1){//in case it appears 2 times like 5-10
				var HRow_end=deps.indexOf('\n',ind)>-1 ? deps.indexOf('\n',ind) : deps.length;
				var HRow_start=deps.substr(0,ind).lastIndexOf('\n   [')+1;
				deps=deps.substr(0,HRow_start)+span(deps.substr(HRow_start,HRow_end-HRow_start),style)+deps.substr(HRow_end);
				ind=getLastIndexHL(deps.substr(0,HRow_start),setName);
			}
			item+=span(clothing.name,style)+'<br/>';
		}
	}
	return [deps,item];
}

/** @param {string} txt @param {string} setName */
function getLastIndexHL(txt,setName){
	var max_index = -1;
	//var max_name = '';
	var parts = highlight_parts[setName] || [];
	for (const name of parts){
		if(txt.lastIndexOf(name) > max_index) {
			max_index = txt.lastIndexOf(name);
			//max_name = name;
		}
	}
	return max_index;
}

function showLevelDropInfo(){
	var l;
	var j=Dom("#level_select").val();
	var degree=Dom("#degree_level").val();
	var levelDropInfo='';
	var levelDropNote='';
	if (j==-1){//material to get
		levelDropInfo+=table()+tr(tab('名稱')+tab('關卡')+tab('材料需求統計'),'style="font-weight:bold;"');
		for(var c=0; c<chapList.length; c++){ //by chapter
			for (l=1;l<30;l++){ //by levels
				/** @type {string | number} */
				var l2=l;
				if(l>20) l2 = "支"+l%10;
				var curLevel = chapList[c]+'-'+l2+degree;
				for (var i in clothes){
					const clothing = clothes[i];
					if (clothing === undefined) continue;
					if (matchClothesLevels(i,curLevel)){//if source matches chapter&level
						var currDeps=clothing.getDeps('   ', 1);
						if (currDeps&&currDeps.indexOf('總計需 1 件')<0){
							var depsResult=addhighlightdeps(i);
							var depsSplit=depsResult[0].split('\n');
							var lack=[];
							for (const depLine of depsSplit){
								if(depLine.indexOf('總計需')>0||depLine.indexOf('[消耗')>0) lack.push(depLine);
							}
							var item=depsResult[1]?depsResult[1]:clothing.name;
							var line=tab(ahref(item,'genFactor('+i+')','inherit'));
								line+=tab(curLevel);
								line+=tab(lack.join('\n'),'class="level_drop_cnt"');
							levelDropInfo+=tr(line);
						}
					}
				}
				
			}
		}
		levelDropInfo+=table(1);
		for (var h in highlight){
			if(Number(h)>0){levelDropNote+='&ensp;/&ensp;';}
			levelDropNote+=span(highlight[h]+'材料',highlight_style[h]);
		}
	}
	else if (j!=0){//chapter chosen
		levelDropInfo+=table()+tr(tab('名稱')+tab('關卡')+tab('材料需求統計'),'style="font-weight:bold;"');
		for (l=1;l<30;l++){//sort by levels
			/** @type {string | number} */
			var l2=l;
			if(l>20) l2 = "支"+l%10;
			var curLevel=j+'-'+l2+degree;
			for (var i in clothes){
				const clothing = clothes[i];
				if (clothing === undefined) continue;
				if (matchClothesLevels(i,curLevel)){//if source matches chapter&level
					var depsResult=addhighlightdeps(i);
					var item=depsResult[1]?depsResult[1]:clothing.name;
					var line=tab(ahref(item,'genFactor('+i+')','inherit'));
						line+=tab(curLevel);
						line+=tab(depsResult[0],'class="level_drop_cnt"');
					levelDropInfo+=tr(line);
				}
			}
		}
		levelDropInfo+=table(1);
		for (var h in highlight){
			if(Number(h)>0){levelDropNote+='&ensp;/&ensp;';}
			levelDropNote+=span(highlight[h]+'材料',highlight_style[h]);
		}
	}
	Dom("#levelDropInfo").html(levelDropInfo);
	Dom("#levelDropNote").html(levelDropNote);
	Dom("#downloadimage").html(imageButton());
}

/** @param {MaterialId} i @param {string} level */
function matchClothesLevels(i,level){
	const clothing = clothes[Number(i)];
	if (!clothing) return false;
	var k;
	var src_sp=clothing.source.split("/");
	for (k=0;k<src_sp.length;k++){
		if(src_sp[k]==level){
			return true;
		}
	}
	return false;
}

function genFactor_main(){
	do{
		var total=0;
		for (var i in clothes){//add extra count once only
			const clothing = clothes[i];
			if (clothing === undefined) continue;
			if(extraInd[i]&&(!extraAdded[i])){
				reqCnt[i]=(reqCnt[i] ?? 0)+1;
				genFactor2(clothing,1);
				extraAdded[i]=1; 
				total+=1;
			}
		}
	}while(total>0);
}

/** @param {MaterialId} id @param {number} [showConstructInd] @param {number} [showConsumeInd] */
function genFactor(id,showConstructInd,showConsumeInd){
	const clothing = clothes[Number(id)];
	if (!clothing) return;
	if(!showConstructInd) showConstructInd = 0;
	if(!showConsumeInd) showConsumeInd = 0;
	clearCnt();
	
	if((showConsumeInd ?? 0)>0) genFactor2(clothing,1);
	else {extraInd[Number(id)]=1; genFactor_main();}
	
	var cell='';
	var output=table()+tr(tab('<b>'+clothing.name+'</b>&ensp;'+clothing.type.type+'&ensp;'+clothing.id+'&ensp;'+cartButton('addCart('+id+')'),'colspan="3"'));
	if(clothing.simple[0]) cell+='簡約'+clothing.simple[0];
	if(clothing.simple[1]) cell+='華麗'+clothing.simple[1];
	if(clothing.active[0]) cell+='&ensp;活潑'+clothing.active[0];
	if(clothing.active[1]) cell+='&ensp;優雅'+clothing.active[1];
	if(clothing.cute[0]) cell+='&ensp;可愛'+clothing.cute[0];
	if(clothing.cute[1]) cell+='&ensp;成熟'+clothing.cute[1];
	if(clothing.pure[0]) cell+='&ensp;清純'+clothing.pure[0];
	if(clothing.pure[1]) cell+='&ensp;性感'+clothing.pure[1];
	if(clothing.cool[0]) cell+='&ensp;清涼'+clothing.cool[0];
	if(clothing.cool[1]) cell+='&ensp;保暖'+clothing.cool[1];
	if(clothing.tags[0]) {
		/** @type {string[]} */
		var tags_conv=[];
		for (var tg in clothing.tags){
			const tagName = clothing.tags[tg];
			if (tagName === undefined) continue;
			tags_conv[tg]=ahref(tagName,"chgScopeSub2(4,'"+clothing.tags[tg]+"')");
		}
		cell+='&ensp;'+tags_conv.join(',');
	}
	if(clothing.set) cell+='&ensp;套裝:'+ahref(clothing.set,"chgScopeSub2(3,'"+clothing.set+"')");
	output+=tr(tab(cell,'colspan="3"'));
	
	cell='來源:'+clothing.source;
	var thisPrice=getMerc(clothing);
	if(thisPrice) cell += ' ('+thisPrice[1]+thisPrice[0]+')';
	
	if(parentInd[Number(id)]) { //if parent show price & formula
		var thisPatternPrice=getPatternPrice(id);
		if(thisPatternPrice) cell += '('+thisPatternPrice+')';
	
		cell+=' = ';
		for (var p in pattern) {
			if (clothesSet[pattern[p][0]][pattern[p][1]]==clothing){
				//output+=clothesSet[pattern[p][2]][pattern[p][3]].name+'x'+pattern[p][4]+' ';
				//show link
				for (var c in clothes){
					const clothing = clothes[c];
					if (clothing === undefined) continue;
					if(clothing==clothesSet[pattern[p][2]][pattern[p][3]]){
						cell+=ahref(clothing.name,'genFactor('+c+')')+'x'+pattern[p][4]+' ';
						break;
					}
				}
			}
		}
		output+=tr(tab(cell,'colspan="3"'));
		output+=genBasicMaterial(0,id,showConstructInd,showConsumeInd);
	}else if(clothing.source.indexOf('重構')>-1){ //if construct show formula
		cell+=' = ';
		for (var con in construct) {
			if (clothesSet[construct[con][0]][construct[con][1]]==clothing){
				cell+=construct[con][2]+'x'+construct[con][3]+' ';
			}
		}
		output+=tr(tab(cell,'colspan="3"'));
	}else{
		output+=tr(tab(cell,'colspan="3"'));
	}
	
	output+=tr(tab('','colspan="3"'));
	
	var deps1=clothing.getDeps('   ', 1);
	if (deps1){
		var pos1=deps1.indexOf('總計需');
		var pos2=deps1.indexOf('件',pos1);
		var strip=deps1.substr(pos1+3,pos2-pos1-3);
		output+=tr(tab('<b>此部件共需數量</b>','colspan="2"')+tab(strip));
		output+=tr(tab(add_genFac(deps1),'class="level_drop_cnt" colspan="3"'));
	}else{
		output+=tr(tab('<b>此部件非製作材料</b>','colspan="3"'));
	}
	output+=table(1);
	
	Dom("#levelDropInfo").html(output);
	Dom("#levelDropNote").html('');
	Dom("#downloadimage").html(imageButton());
}

/** @param {MaterialClothing} cloth @param {number} num */
function genFactor2(cloth,num){
	for (var i in pattern) {
		if (clothesSet[pattern[i][0]][pattern[i][1]]==cloth){//found factor
			for (var j in clothes){//mark it as parent
				const clothing = clothes[j];
				if (clothing === undefined) continue;
				if(clothing==cloth) parentInd[j]=1;
			}
			if(pattern[i][4]>1){//if num required>1
				for (var j in clothes){//mark sub as extra count needed
					const clothing = clothes[j];
					if (clothing === undefined) continue;
					if(clothing==clothesSet[pattern[i][2]][pattern[i][3]]){extraInd[j]=1;break;}
				}
				addreqCnt(clothesSet[pattern[i][2]][pattern[i][3]],(pattern[i][4]-1)*num);
				genFactor2(clothesSet[pattern[i][2]][pattern[i][3]],(pattern[i][4]-1)*num);
			}else if(pattern[i][5]!='染'){//do not consume
				for (var j in clothes){
					const clothing = clothes[j];
					if (clothing === undefined) continue;
					if(clothing==clothesSet[pattern[i][2]][pattern[i][3]]) extraInd[j]=1;
				}
			}else{//dye
				addreqCnt(clothesSet[pattern[i][2]][pattern[i][3]],pattern[i][4]*num);
				genFactor2(clothesSet[pattern[i][2]][pattern[i][3]],pattern[i][4]*num);
				for (var c in convert){//add dye count
					if(cloth==clothesSet[convert[c][0]][convert[c][1]]){
						var convertIndex = Dom.inArray(convert[c][2],convertlist);
						if (convertIndex >= 0) convertlistCnt[convertIndex] = (convertlistCnt[convertIndex] || 0) + convert[c][4]*num;
						break;
					}
				}
			}
		}
	}
}

function clearCnt(){
	for (var i in clothes){//clear count in previous run
		reqCnt[i]=0;
		parentInd[i]=0;
		extraInd[i]=0;
		extraAdded[i]=0;
		shownFactor[i]=0;
	}
	for (var i in convertlist){
		convertlistCnt[i]=0;
	}
}

/** @param {MaterialClothing} cloth @param {number} num */
function addreqCnt(cloth,num){//add num in reqCnt[]
	for (var i in clothes){
		const clothing = clothes[i];
		if (clothing === undefined) continue;
		if (clothing==cloth){
			if(reqCnt[i]) reqCnt[i]=(reqCnt[i] ?? 0)+num;
			else reqCnt[i]=num;
		}
	}
}

function searchById(){
	var levelDropNote = '';
	var searchById=Dom.trim(Dom("#searchById").val());
	var searchById_match=0;
	if(searchById){
		var levelDropInfo='查找：'+searchById;
		levelDropNote=table()+tr(tab('名稱')+tab('分類')+tab('編號')+tab('來源')+tab(''),'style="font-weight:bold;"');
		for (var c in category){//sort by category
			for (var i in clothes){
				const clothing = clothes[i];
				if (clothing === undefined) continue;
				if( (clothing.name.indexOf(searchById)>-1||parseInt(clothing.id)==parseInt(searchById))
					&& clothing.type.type==category[c]){
					var line=tab(ahref(clothing.name,'genFactor('+i+')'));
						line+=tab(clothing.type.type);
						line+=tab(clothing.id);
						var srcs = conv_source(clothing.source, clothing.type.mainType);
						line+=tab(srcs);
						line+=tab(cartButton('addCart('+i+')'));
					levelDropNote+=tr(line);
					searchById_match=1;
				}
			}
		}
		levelDropNote+=table(1);
		Dom("#levelDropInfo").html(levelDropInfo);
		if(searchById_match) Dom("#levelDropNote").html(levelDropNote);
		else Dom("#levelDropNote").html('沒有找到相關資料');
		Dom("#downloadimage").html(imageButton());
	}
}

/** @param {string} setName @param {number} [showConstructInd] @param {number} [showConsumeInd] */
function searchSet(setName,showConstructInd,showConsumeInd){//showConsumeInd is dummy now
	if(!showConstructInd) showConstructInd=0;
	if(!showConsumeInd) showConsumeInd=0;
	clearCnt();
	
	var setCnt=0; var thisPatternPrice=0;
	for (var i in clothes){
		const clothing = clothes[i];
		if (clothing === undefined) continue;
		if(clothing.set==setName){
			extraInd[i]=1;
			setCnt+=1;
			var thisPatternPrice_i=getPatternPrice(i); 
			if(thisPatternPrice_i) thisPatternPrice += thisPatternPrice_i;
		}
	}
	
	if((showConsumeInd ?? 0)>0){
		clearCnt();
		for (var i in clothes){
			const clothing = clothes[i];
			if (clothing === undefined) continue;
			if(clothing.set==setName){
				genFactor2(clothing,1);
			}
		}
	}
	else genFactor_main();
	
	var thisPatternPrice_2=0;
	for (var i in clothes){
		if((parentInd[i] ?? 0)>0||(reqCnt[i] ?? 0)>0){
			var thisPatternPrice_in=getPatternPrice(i); 
			if(thisPatternPrice_in) thisPatternPrice_2 += thisPatternPrice_in;
		}
	}
	
	var output=table();
	var cell='<b>套裝：</b>'+ahref(setName,"chgScopeSub2(3,'"+setName+"')")+'　全'+setCnt+'個部件材料總覽';
	output+=tr(tab(cell,'colspan="3"'));
	if(thisPatternPrice>0||thisPatternPrice_2>0){
		output+=tr(tab((thisPatternPrice>0? '設計圖總價：'+thisPatternPrice+'&emsp;':'')+(thisPatternPrice_2>thisPatternPrice? '設計圖總價(含材料)：'+thisPatternPrice_2:''),'colspan="3"'));
	}
	output+=tr(tab('','colspan="3"'));
	output+=genBasicMaterial(1,setName,showConstructInd,showConsumeInd);
	output+=table(1);
	
	Dom("#levelDropInfo").html(output);
	Dom("#levelDropNote").html('');
	Dom("#downloadimage").html(imageButton());
}

/** @param {number} setInd @param {MaterialId} id @param {number} [showConstructInd] @param {number} [showConsumeInd] */
function genBasicMaterial(setInd,id,showConstructInd,showConsumeInd){
	var l, l1;
	if(!showConstructInd){showConstructInd=0; var constxt='查看重構材料'; var oppoConstructInd=1;}
	else{var constxt='查看部件材料'; var oppoConstructInd=0;}
	if(!showConsumeInd){showConsumeInd=0; var reqtxt='需求數量'; var oppoConsumeInd=1;}
	else{var reqtxt='消耗數量'; var oppoConsumeInd=0;}
	/** @type {string[]} */
	var header=[];
	/** @type {string[]} */
	var content=[];
	var construct_href_1='genFactor('+id+',';
	if(setInd==1) construct_href_1 = "searchSet('"+id+"',";
	if(setInd==2) construct_href_1 = "calcCart(";
	var output=tr(tab('基礎材料')+tab('來源')+tab(ahref(reqtxt,construct_href_1+showConstructInd+','+oppoConsumeInd+')')),'style="font-weight:bold;"');
	
	for (var s in src){//sort by source
		var sourceRule = src[s];
		if (sourceRule === undefined) continue;
		var sourceDescription = src_desc[s] || '';
		/** @type {Record<string, number>} */
		var mercRes={};
		header[s]='<u>'+sourceDescription+'</u>'+((sourceRule=='重構')?'　'+ahref(constxt,construct_href_1+oppoConstructInd+','+showConsumeInd+')'):'');
		if(Number(s)<2){
			for (l1=0; l1<chapList.length; l1++){
				for (l=1;l<30;l++){//sort by level
					/** @type {string | number} */
					var l2=l;
					if(l>20) l2="支"+l%10;
					for (var i in clothes){
						const clothing = clothes[i];
						if (clothing === undefined) continue;
						if((!shownFactor[i])&&reqCnt[i]&&(!parentInd[i])){
						var srci=clothing.source;
						var src_sp=clothing.source.split("/");
						for (var ss in src_sp){
							const sourcePart = src_sp[ss];
							if (sourcePart === undefined) continue;
							if( (Number(s)==0&&sourcePart.indexOf(chapList[l1]+'-'+l2+sourceRule)==0&&srci.indexOf(src[1] ?? '')<0) ||
								(Number(s)==1&&sourcePart.indexOf(chapList[l1]+'-'+l2+sourceRule)==0) ){
								if(!content[s]) content[s]='';
								content[s]+=retFactor(i,srci);
								break;
							}
						}
					}}
				}
			}
		}else if (sourceRule=='重構'&&showConstructInd){ //for construct
			var constructMaterial=function() {
				var ret = [];
				for (var i in constructMaterialName) {
					ret.push(0);
				}
				return ret;
			}();
			for (var i in clothes){
				const clothing = clothes[i];
				if (clothing === undefined) continue;
				if((!shownFactor[i])&&reqCnt[i]&&(!parentInd[i])&&clothing.source.indexOf(sourceRule)>-1){
				for (var con in construct) {
					if (clothesSet[construct[con][0]][construct[con][1]]==clothing){
						shownFactor[i]=1;
						for (var m in constructMaterialName){ if(Dom.trim(construct[con][2])==constructMaterialName[m]) {
							constructMaterial[m]=(constructMaterial[m] ?? 0)+(construct[con][3]-1)*(reqCnt[i] ?? 0);
							break;
						}}
					}
				}
			}}
			for (var i in constructMaterial){
				const count = constructMaterial[i];
				if (count !== undefined && count>0){
					if(!content[s]) content[s]='';
					content[s]+=tr(tab(constructMaterialName[i])+tab('分解')+tab(count+(showConsumeInd?0:1)));
				}
			}
		}else{

			var s_split=sourceRule.split(',');//sort by defined order
			for(var sp_n in s_split){
				const sourcePart = s_split[sp_n];
				if (sourcePart === undefined) continue;
				for (var i in clothes){
					const clothing = clothes[i];
					if (clothing === undefined) continue;
				if((!shownFactor[i])&&reqCnt[i]&&(!parentInd[i])){
					var srci=clothing.source;
					if(srci.indexOf(sourcePart)>-1){
						if(!content[s]) content[s]='';
						content[s]+=retFactor(i,srci);
						var price=getMerc(clothing); //add sum of price for each category
						if(price){
							if(!mercRes[price[0]]) mercRes[price[0]]=price[1]*(reqCnt[i] ?? 0);
							else mercRes[price[0]] = (mercRes[price[0]] || 0) + price[1]*(reqCnt[i] ?? 0);
						}
					}
				}}
			}
		}
		if (content[s]) {
			var mercRes_txt='';
			if(mercRes){
				for (var mm in mercRes) {mercRes_txt+='&emsp;'+mm+mercRes[mm];}
				if(mercRes_txt) {mercRes_txt='<br>&emsp;總計：'+mercRes_txt.replace('&emsp;','');}
			}
			output+=tr(tab(header[s]+mercRes_txt,'colspan="3"'))+content[s];
		}
	}
	//explain if content all blank
	for (var s in src){
		if(content[s]) break;
		if(Number(s)==src.length-1) output += tr(tab('無','colspan="3"'));
	}
	
	var dye=''; var dye_jjc=0; var dye_lm=0;
	for (var c in convertlist) {
		const dyeName = convertlist[c];
		const dyeCount = convertlistCnt[c];
		if (dyeName === undefined || dyeCount === undefined) continue;
		if(dyeCount>0) {
		dye+=tr(tab(dyeName,'colspan="2"')+tab(dyeCount));
		dye_jjc+=dyeCount*convertPrice[dyeName][0];
		dye_lm+=dyeCount*convertPrice[dyeName][1];
	}}
	if(dye) {output+=tr(tab('<u>染料</u><br>&emsp;總計：'+dye_jjc+'星光幣/'+dye_lm+'聯盟幣','colspan="3"'))+dye;}
	
	return output;
}

/** @param {string} text @param {number} [inherit] */
function add_genFac(text,inherit){
	var textArr=text.split('\n'); //[0] to [length-2];
	var parents=[];
	for (var i=1;i<textArr.length-1;i++){//discard [0] for its own name
		const line = textArr[i];
		if (line === undefined) continue;
		var pos_end=(line.indexOf('[消耗')>-1 ? line.indexOf('[消耗') : line.length);
		var pos_start=line.substr(0,pos_end).lastIndexOf(']')+1;
		var pos_start_1=line.substr(0,pos_start).lastIndexOf('[')+1;
		var clo_name=line.substr(pos_start,pos_end-pos_start);
		var clo_type=line.substr(pos_start_1,pos_start-pos_start_1-1);
		for (var c in clothes){
			const clothing = clothes[c];
			if (clothing === undefined) continue;
			if (clothing.type.mainType==clo_type&&clothing.name==clo_name){
				clo_name=ahref(clo_name,'genFactor('+c+')',(inherit? 'inherit' : ''));
				break;
			}
		}
		const parent = line.substr(0,pos_start)+clo_name+line.substr(pos_end);
		parents[i-1]=inherit ? parent : parent.substr(3);
	}
	var out=(inherit? textArr[0]+'\n':'')+parents.join('\n')+'\n';
	return out;
}

/** @param {MaterialId} i @param {string} srci */
function retFactor(i,srci){
	const clothing = clothes[Number(i)];
	if (!clothing) return '';
	shownFactor[Number(i)]=1;
	var ret=tab(ahref(clothing.name,'genFactor('+i+')'));
		ret+=tab(srci);
		ret+=tab(reqCnt[Number(i)]);
	return tr(ret);
}

/** @param {string} setName */
function hvConvert(setName){
	for(var i in clothes){
		const clothing = clothes[i];
		if (clothing === undefined) continue;
		if(clothing.set==setName){
			for (var p in pattern){
				if (pattern[p][5]=='染'&&(clothesSet[pattern[p][0]][pattern[p][1]]==clothing||clothesSet[pattern[p][2]][pattern[p][3]]==clothing)){
					return 1;
				}
			}
		}
	}
	return 0;
}

/** @param {string} src @param {string} mainType */
function conv_source(src,mainType){
	if (src.indexOf('定')>=0 || src.indexOf('進')>=0) {
		var orig_num = src.replace(/[^(定|進)]*(定|進)([0-9]+)[^0-9]*/, "$2");
		for (var p in clothes){
			const clothing = clothes[p];
			if (clothing === undefined) continue;
			if (clothing.type.mainType==mainType&&clothing.id==orig_num) return src.replace(orig_num, '-' + clothing.name);
		}
	}
	return src;
}

/** @param {MaterialClothing} piece @returns {[string, number] | undefined} */
function getMerc(piece){
	for (var m in merchant){
		if(piece==clothesSet[merchant[m][0]][merchant[m][1]]){
			return [merchant[m][3],merchant[m][2]];
		}
	}
	return;
}

/** @param {MaterialId} id @returns {number | undefined} */
function getPatternPrice(id){
	const clothing = clothes[Number(id)];
	if (!clothing) return;
	for (var pc in patternPrice){
		if (clothing.type.mainType==patternPrice[pc][0]&&clothing.id==patternPrice[pc][1]){
			return patternPrice[pc][2];
		}
	}
	return;
}

/** @template T @param {T[]} arr @returns {T[]} */
function getDistinct(arr){
	var newArr=[];
	for (var i in arr){
		// for...in supplies an existing key; retain explicit undefined values if T includes them.
		const value = /** @type {T} */ (arr[i]);
		if(Dom.inArray(value, newArr)<0){
			newArr.push(value);
		}
	}
	return newArr;
}

function get_convertlist(){
	for(var i in convert){
		convertlist.push(convert[i][2]);
	}
	convertlist=getDistinct(convertlist);
}

function get_maxc(){
	for (var i in clothes){
		const clothing = clothes[i];
		if (clothing === undefined) continue;
		if(clothing.source.indexOf('公')>0||clothing.source.indexOf('少')>0){
			var srcs=clothing.source.split('/');
			for (var s in srcs){
				const sourcePart = srcs[s];
				if (sourcePart === undefined) continue;
				if ((sourcePart.indexOf('公')>0||sourcePart.indexOf('少')>0)&&sourcePart.indexOf('-')>0){
					var chapter = sourcePart.substr(0,sourcePart.lastIndexOf('-'));
					if (Dom.inArray(chapter,chapList)<0) chapList.push(chapter);
				}
			}
		}
	}
	chapList.sort(function(a,b){
		var ae = a.replace(/[0-9-]*/g,''); //episode
		var be = b.replace(/[0-9-]*/g,'');
		var ac = a.replace(/[^0-9]*/g,''); //chapter
		var bc = b.replace(/[^0-9]*/g,'');
		if (ae == be) return Number(ac) - Number(bc); //same episode, compare only chapter
		else return ae > be ? 1 : (ae < be ? -1 : 0) ; //differnt episode
	});
}

/** @param {unknown} text @param {string} [attr] */
function tab(text,attr){
	return '<td'+(attr? ' '+attr : '')+'>'+text+'</td>';
}

/** @param {string} text @param {string} [attr] */
function tr(text,attr){
	return '<tr'+(attr? ' '+attr : '')+'>'+text+'</tr>';
}

/** @param {string} text @param {string} [cls] */
function span(text,cls){
	return '<span'+(cls? ' class="'+cls+'"' : '')+'>'+text+'</span>';
}

/** @param {string} action */
function materialActionAttr(action){
	return 'data-material-action="'+encodeURIComponent(action || '')+'"';
}

/** @param {string} action */
function materialChangeAttr(action){
	return 'data-material-change="'+encodeURIComponent(action || '')+'"';
}

/** @param {string} text @param {string} action @param {string} [cls] */
function ahref(text,action,cls){
	return '<a href="#" '+materialActionAttr(action)+' '+(cls? 'class="'+cls+'" ' : '')+'>'+text+'</a>';
}

function imageButton(){
	return '<button '+materialActionAttr('toimage()')+' class="btn btn-default" style="line-height: 100%;">轉為圖檔</button>';
}

/** @param {number} [ind] */
function table(ind){
	return ind? '</table>' : '<table border="1">';
}

/** @param {string} id @param {string} onchange @param {(string | number)[]} valArr @param {(string | number)[]} [textArr] */
function selectBox(id,onchange,valArr,textArr){
	var ret='<select id="'+id+'" '+materialChangeAttr(onchange)+'>';
	if(!textArr) textArr = valArr;
	for (var i in valArr){
		const value = valArr[i];
		if (value === undefined) continue;
		ret+='<option value="'+value+'">'+textArr[i]+'</option>';
	}
	ret+='</select>';;
	return ret;
}

function enterKey() {
	Dom('#searchById').keydown(function(e) {
		if (e.keyCode==13) {
			Dom(this).blur();
			Dom('.search').click();
		}
	});
}

//below for custom inventory/cart

function show_inv(){
	Dom('#invopts').html(ahref('<em>↑</em>展開衣櫃<em>↑</em>',' ','showInv')+'&emsp;'+ahref('<em>↑</em>展開購物車<em>↑</em>',' ','showCart'));
	Dom('#custInv').html('<button '+materialActionAttr('loadCustomInventory()')+'>更新</button><button '+materialActionAttr('clearCustomInventory()')+'>清空</button>');
	Dom('#custInv').append('&emsp;<a href="#" tooltip="計算部件作為材料所需數量時會扣除已有成品的所需數量；計算基礎材料數量時不會扣除已有材料。">說明</a>');
	Dom('#custInv').append('<br><textarea id="myClothes" rows="5"></textarea><hr>');
	Dom('#custCart').html('<button '+materialActionAttr('calcCart()')+'>計算</button><button '+materialActionAttr('clearCart()')+'>清空</button>&ensp;<span id="cartCont"></span><hr>');
	Dom('.showInv').click(function(){
		if(Dom('#custInv').css('display')=='none'){
			Dom('#custInv').show();
			Dom('.showInv').html('↑收起衣櫃↑');
		}else{
			Dom('#custInv').hide();
			Dom('.showInv').html('<em>↑</em>展開衣櫃<em>↑</em>');
		}
	});
	Dom('.showCart').click(function(){
		if(Dom('#custCart').css('display')=='none'){
			Dom('#custCart').show();
			Dom('.showCart').html('↑收起購物車↑');
		}else{
			Dom('#custCart').hide();
			Dom('.showCart').html('<em>↑</em>展開購物車<em>↑</em>');
		}
	});
	Dom('button').addClass('btn btn-default');
	Dom('button').css('line-height','100%');
}

function clearCustomInventory(){
	Dom("#myClothes").val('');
	loadCustomInventory();
}

/** @param {number} [showConstructInd] @param {number} [showConsumeInd] */
function calcCart(showConstructInd,showConsumeInd){
	if(!showConstructInd) showConstructInd = 0;
	clearCnt();
	var thisPatternPrice=0;
	for (var i in cartCont){
		const cartId = cartCont[i];
		if (cartId === undefined) continue;
		extraInd[Number(cartId)]=1;
		var thisPatternPrice_i=getPatternPrice(cartId);
		if(thisPatternPrice_i) thisPatternPrice += thisPatternPrice_i;
	}
	
	if((showConsumeInd ?? 0)>0){
		clearCnt();
		for (var i in cartCont){
			const cartId = cartCont[i];
			if (cartId === undefined) continue;
			const clothing = clothes[Number(cartId)];
			if (!clothing) continue;
			genFactor2(clothing,1);
		}
	}
	else genFactor_main();
	
	var thisPatternPrice_2=0;
	for (var i in clothes){
		if((parentInd[i] ?? 0)>0||(reqCnt[i] ?? 0)>0){
			var thisPatternPrice_in=getPatternPrice(i); 
			if(thisPatternPrice_in) thisPatternPrice_2 += thisPatternPrice_in;
		}
	}
	
	var output=table();
	output+=tr(tab('<b>購物車：</b>共'+cartCont.length+'個部件材料統計','colspan="3"'));
	if(thisPatternPrice>0||thisPatternPrice_2>0){
		output+=tr(tab((thisPatternPrice>0? '設計圖總價：'+thisPatternPrice+'&emsp;':'')+(thisPatternPrice_2>thisPatternPrice? '設計圖總價(含材料)：'+thisPatternPrice_2:''),'colspan="3"'));
	}
	output+=tr(tab('','colspan="3"'));
	output+=genBasicMaterial(2,'',showConstructInd,showConsumeInd);
	output+=table(1);
	
	Dom("#levelDropInfo").html(output);
	Dom("#levelDropNote").html('');
	Dom("#downloadimage").html(imageButton());
}

/** @param {MaterialId} i */
function addCart(i){
	cartCont.push(i);
	refreshCart();
}

/** @param {MaterialId} id */
function delCart(id){
	var newArr=cartCont;
	cartCont=[];
	for (var i in newArr){
		const cartId = newArr[i];
		if (cartId === undefined) continue;
		if(cartId!=id) cartCont.push(cartId);
	}
	refreshCart();
}

/** @param {string} val */
function addCartList(val){
	var valArr=val.split('/');
	for(var i in valArr){
		const clothingId = valArr[i];
		if (clothingId === undefined) continue;
		cartCont.push(parseInt(clothingId));
	}
	refreshCart();
}

function refreshCart(){
	Dom('#cartCont').html('');
	cartCont=getDistinct(cartCont);
	if(cartCont.length>0) Dom('#cartCont').append('<br>');
	for (var i in cartCont){
		const cartId = cartCont[i];
		if (cartId === undefined) continue;
		const clothing = clothes[Number(cartId)];
		if (!clothing) continue;
		Dom('#cartCont').append('<button class="btn btn-xs btn-default">'+ahref(clothing.name,"genFactor("+cartId+")","search")+ahref('[×]','delCart('+cartId+')')+'</button>&ensp;');
	}
}

function clearCart(){
	cartCont=[];
	refreshCart();
}

/** @param {string} action */
function cartButton(action){
	return '<button class="glyphicon glyphicon-shopping-cart btn btn-xs btn-default" '+materialActionAttr(action)+'></button>'
}

//below are modified from nikki.js, for custom inventory

Dom(document).ready(function () {
	var mine = loadFromStorage();
	updateSize(mine);
});

/** @param {import('./src/domain/inventory/types.d.ts').Inventory<import('./src/domain/scoring/types.d.ts').ScoringClothing>} mine */
function updateSize(mine) {
	Dom("#myClothes").val(mine.serialize());
}

function loadCustomInventory() {
	var myClothes = Dom("#myClothes").val().replace(/上衣/g,'上衣');
	if (myClothes.indexOf('|') > 0) {
		loadNew(myClothes);
	} else {
		load(myClothes);
	}
	saveAndUpdate();
}

function saveAndUpdate() {
	var mine = save();
	updateSize(mine);
}

function toimage() {
	const element = document.getElementById("levelDropInfo");
	if (!element) return;
	html2canvas(element, {
        	onrendered: function(canvas) {
                    Dom("#auto").attr('href', canvas.toDataURL("image/png"));
                    Dom("#auto").attr('download','download.png');
                    var lnk = document.getElementById("auto");
                    if (lnk) lnk.click();
        	}
      	});
}
MaterialActions.register({
  show_scope,
  chgScope,
  chooseSet,
  searchSetMain,
  searchBySetId,
  chgScopeSub,
  chgScopeSub2,
  chgStars,
  chgStars2,
  compareStr,
  showFactorInfo,
  addhighlightdeps,
  getLastIndexHL,
  showLevelDropInfo,
  matchClothesLevels,
  genFactor_main,
  genFactor,
  genFactor2,
  clearCnt,
  addreqCnt,
  searchById,
  searchSet,
  genBasicMaterial,
  add_genFac,
  retFactor,
  hvConvert,
  conv_source,
  getMerc,
  getPatternPrice,
  getDistinct,
  get_convertlist,
  get_maxc,
  tab,
  tr,
  span,
  materialActionAttr,
  materialChangeAttr,
  ahref,
  imageButton,
  table,
  selectBox,
  enterKey,
  show_inv,
  clearCustomInventory,
  calcCart,
  addCart,
  delCart,
  addCartList,
  refreshCart,
  clearCart,
  cartButton,
  updateSize,
  loadCustomInventory,
  saveAndUpdate,
  toimage
});

Dom(document).ready(function () {
	calcDependencies();
	get_convertlist();
	get_maxc();
	show_scope();
	show_inv();
});
