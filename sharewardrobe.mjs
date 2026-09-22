import { MyClothes, clothes } from './model.mjs';

/** @type {import('./src/legacy/native-dom-types.d.ts').DomFacade} */
const Dom = /** @type {typeof globalThis & { Dom: import('./src/legacy/native-dom-types.d.ts').DomFacade }} */ (globalThis).Dom;
const category = /** @type {typeof globalThis & { category: string[] }} */ (globalThis).category;
function shareWardrobe() {
	var myClothes = MyClothes();
	myClothes.filter(clothes);
	var mine = myClothes.mine;
	/** @type {Record<string, string>} */
	var result = {};
	for (const categoryType of category) {
		var type = categoryType;
		if (type.indexOf('飾品') >= 0) {
			if (type == '飾品-頭飾')
				type = "飾品";
			else
				continue;
		}
		if (type.indexOf('襪子') >= 0) {
			if (type == '襪子-襪子')
				type = "襪子";
			else
				continue;
		}
		if (!mine[type]) {
			result[type] = "1";
			continue;
		}
		var ids = mine[type] || [];
		var size = Number(ids[ids.length - 1] ?? 0);
		var array = [1];
		for (var i = 0; i < size; i++) {
			array.push(0);
		}
		for (const ownedId of ids) {
			var id = Number(ownedId);
			array[id] = 1;
		}
		var str = array.join('');
		result[type] = zipNum(str);
	}
	var strUrl = "http://seal100x.github.io/nikkiup2u3?";
	for (var r in result) {
		strUrl += typeToggleChar(r) + "=" + result[r] + "&";
	}
	strUrl.substr(0,strUrl.length-1);
	Dom("#share-link").html("<a href=" + strUrl + ">" + strUrl + "</a>");
}

/**
 * @param {string} source
 */
function typeToggleChar(source){
	if(source  == '髮型')
		return 'a';
	if(source  == '連身裙')
		return 'b';
	if(source  == '外套')
		return 'c';
	if(source  == '上衣')
		return 'd';
	if(source  == '下著')
		return 'e';
	if(source  == '襪子')
		return 'f';
	if(source  == '鞋子')
		return 'g';
	if(source  == '妝容')
		return 'h';
	if(source  == '飾品')
		return 'i';
	if(source  == '螢光之靈')
		return 'j';

	if(source  == 'a')
		return '髮型';
	if(source  == 'b')
		return '連身裙';
	if(source  == 'c')
		return '外套';
	if(source  == 'd')
		return '上衣';
	if(source  == 'e')
		return '下著';
	if(source  == 'f')
		return '襪子';
	if(source  == 'g')
		return '鞋子';
	if(source  == 'h')
		return '妝容';
	if(source  == 'i')
		return '飾品';
	if(source  == 'j')
		return '螢光之靈';
}

function getWardrobe() {
	var request = GetRequest();
	var txt = "";
	for (var t in request) {
		txt += typeToggleChar(t);
		txt += ":";
		var str = unzipNum(/** @type {string} */ (request[t]));
		str = str.substr(1,str.length);
		for (let index = 0; index < str.length; index++) {
			if (str.charAt(index) == "1") {
				var id = index + 1;
				if (id < 10) {
					txt += "00" + id + ",";
				} else if (id < 100) {
					txt += "0" + id + ",";
				} else {
					txt += id + ",";
				}
			}
		}
		txt = txt.substr(0,txt.length-1) + "|";
	}
	console.log(txt);
}

function GetRequest() {
	var url = location.search; //獲取url中"?"符後的字串
	var theRequest = /** @type {Record<string, string>} */ (new Object());
	if (url.indexOf("?") != -1) {
		var str = url.substr(1);
		var strs = str.split("&");
		for (const entry of strs) {
			const [key = '', value = ''] = entry.split('=');
			theRequest[key] = unescape(value);
		}
	}
	return theRequest;
}

/**
 * @param {string} inputNum
 */
function zipChunk(inputNum){
	var numeric = parseInt(inputNum, 2);
	if(numeric > 61){
		if(numeric == 62)
			return "(";
		if(numeric == 63)
			return ")";
	}
	else if(numeric > 35){//用大寫字母表示36-61
		return String.fromCharCode('A'.charCodeAt(0) + numeric % 36);
	} else if(numeric > 9){//用小寫字母表示10-35
		return String.fromCharCode('a'.charCodeAt(0) + numeric % 10);
	}
	return String(numeric);
}

/**
 * @param {string} num
 */
function zipNum(num){
	var result = "";
	for(var i = num.length; i>0; i-=6){
		if(i<6){
			result = zipChunk(num.substr(0,i)) + result;
		}
		else{
			result = zipChunk(num.substr(i-6,6)) + result;
		}
	}
    return result;
}

/**
 * @param {string} num
 */
function unzipNum(num){
	var result = "";
	for(var i = num.length; i>=0; i--){
		result = unzip(num.substr(i-1,1)) + result;
	}
    return result;
}

/**
 * @param {string} inputNum
 */
function unzip(inputNum){
	if(inputNum == "(")
		return "111110";
	if(inputNum == ")")
		return "111111";
	if(/^[0-9]$/.test(inputNum)){
		return pad(Number(inputNum).toString(2), 6);
	}
	if(/** @type {{ charCodeAt(index?: number): number }} */ (inputNum).charCodeAt() <= 'Z'.charCodeAt(0)){
		return pad((/** @type {{ charCodeAt(index?: number): number }} */ (inputNum).charCodeAt() - 'A'.charCodeAt(0) + 36).toString(2), 6);
	}
	if(/** @type {{ charCodeAt(index?: number): number }} */ (inputNum).charCodeAt() <= 'z'.charCodeAt(0)){
		return pad((/** @type {{ charCodeAt(index?: number): number }} */ (inputNum).charCodeAt() - 'a'.charCodeAt(0) + 10).toString(2), 6);
	}
}

/**
 * @param {string} num
 * @param {number} n
 */
function pad(num, n) {
	var len = num.toString().length;
	while(len < n) {
		num = "0" + num;
		len++;
	}
	return num;
}


export { shareWardrobe, typeToggleChar, getWardrobe, GetRequest, zipNum, unzipNum, unzip, pad };
