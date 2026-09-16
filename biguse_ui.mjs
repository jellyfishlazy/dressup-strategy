import { clothes } from './model.mjs';
import { td, render } from './ui.mjs';
import { goTop, toggleInventory, criteria, byCategoryAndScore } from './nikki.mjs';
import { shoppingCart1, shoppingCart2 } from './biguse_model.mjs';
import * as BigUseDomain from './src/domain/biguse/index.mjs';

/** @typedef {import('./src/legacy/native-dom-types.d.ts').DomFacade} DomFacade */
/** @typedef {import('./src/legacy/native-dom-types.d.ts').DomCollection} DomCollection */
/** @typedef {import('./src/domain/scoring/types.d.ts').ScoringClothing} ScoringClothing */
/** @typedef {{ name: string, sumScore?: number, id?: string, type?: ScoringClothing['type'] }} BigUseRow */
/** @typedef {import('./src/domain/biguse/types.d.ts').AutocompleteSuggestion<ScoringClothing>} Suggestion */
/** @typedef {{ attach(input: HTMLElement | null, options: { lookup(query: string): Suggestion[], onSelect(suggestion: Suggestion): void }): unknown }} Autocomplete */

/** @type {DomFacade} */
const Dom = /** @type {typeof globalThis & { Dom: DomFacade }} */ (globalThis).Dom;
const NativeAutocomplete = /** @type {typeof globalThis & { NativeAutocomplete: Autocomplete }} */ (globalThis).NativeAutocomplete;
const wardrobe2 = /** @type {typeof globalThis & { wardrobe2: Record<string, [string, string, string]> }} */ (globalThis).wardrobe2;
const color = /** @type {typeof globalThis & { color: Record<string, [string, string]> }} */ (globalThis).color;
/**
 * @param {DomCollection} $row
 */
function copyNameText($row) {
	// 清除所有其他行的highlight
	Dom('.table-row.highlighted').removeClass('highlighted');

	// 只複製名稱欄位的文字（第三個 table-td，因為第一個是複製按鈕欄位，第二個是分數）
	var $nameTd = $row.find('.table-td').eq(2);
	var textToCopy = $nameTd.text().trim();

	// 創建臨時 textarea 來複製文字
	var tempTextarea = document.createElement('textarea');
	tempTextarea.value = textToCopy;
	document.body.appendChild(tempTextarea);
	tempTextarea.select();
	document.execCommand('copy');
	document.body.removeChild(tempTextarea);

	// 添加highlight到當前行
	$row.addClass('highlighted');

	// 顯示複製成功的提示
	var $copyBtn = $row.find('.copy-btn');
	var originalText = $copyBtn.text();
	$copyBtn.text('已複製!').css('background-color', '#28a745');
	setTimeout(function() {
		$copyBtn.text(originalText).css('background-color', '');
	}, 1000);
}

function copyButton() {
	return Dom('<button>')
		.addClass('copy-btn')
		.addClass('btn')
		.addClass('btn-sm')
		.addClass('btn-outline-secondary')
		.text('複製')
		.css({
			'font-size': '10px',
			'padding': '2px 6px',
			'margin': '0 auto',
			'display': 'block'
		})
		.click(function() {
			var $row = Dom(this).closest('.table-row');
			copyNameText($row);
		});
}

/**
 * @param {boolean} isShoppingCart
 */
function theadBiguse(isShoppingCart) {
	var $thead = Dom("<div>").addClass("table-head");
	$thead.append(td("", "copy-header"));
	$thead.append(td("分數", "score"));
	$thead.append(td("名稱", "name"));
	$thead.append(td("圖片", ""));
	$thead.append(td("部件大小", "area"));
	$thead.append(td("部件顏色", "color1"));
	$thead.append(td("搜索用顏色", "color2"));
	$thead.append(td("類別", "category"));
	$thead.append(td("編號", "th_number"));
	var $td_nbsp = td("", "");
	if (!isShoppingCart) {
		$td_nbsp = td("回到頂部", "th_gotop");
		$td_nbsp.addClass("gogogo-top");
		$td_nbsp.click(function () {
			goTop();
		});
	}
	$thead.append(td("", ""));
	$thead.append($td_nbsp);

	return $thead;
}

/**
 * @param {BigUseRow} piece
 * @param {boolean} isShoppingCart
 * @param {number} index
 */
function rowBiguse(piece, isShoppingCart, index) {
	var $row = Dom("<div>").addClass("table-row");
	var $lineTop = $row;
	//var $lineTop = Dom("<div>").addClass("table-line");

	// 第一個 table-td：複製按鈕欄位
	var $copyTd = td("", "copy-cell");
	$lineTop.append($copyTd);

	$lineTop.append(td(piece.sumScore, 'score'));

	// 第三個 table-td：名稱欄位
	var $nameTd;
	if (isShoppingCart) {
		$nameTd = td(piece.name, '');
	} else {
		$nameTd = clothesNameTd(/** @type {ScoringClothing} */ (piece));
	}
	$lineTop.append($nameTd);

	var identity = BigUseDomain.pieceIdentity(piece);
	var longid = BigUseDomain.imageLongId(piece);

	var $imagetd = td("點擊查看", 'image');
	$imagetd.click(function(){
		Dom("#imgModel").show();
		Dom("#imgModel").css("background-image", "url(https://seal100x.github.io/nikkiup2u3_img/" +  longid + ".png)");
		Dom("#imgInfo").text(piece.name);
	});
	$lineTop.append($imagetd);
	if(wardrobe2[longid]){
		$lineTop.append(td(/** @type {[string, string, string]} */ (wardrobe2[longid])[0], "area"));

	var colortd1 = td("", "");
	colortd1.css("background", "rgb("+ /** @type {[string, string, string]} */ (wardrobe2[longid])[1]+ ")");
		$lineTop.append(colortd1);

	var colortd2 = td( /** @type {[string, string]} */ (color[/** @type {[string, string, string]} */ (wardrobe2[longid])[2]])[1], "color_search");
	colortd2.css("background", "rgb("+ /** @type {[string, string]} */ (color[/** @type {[string, string, string]} */ (wardrobe2[longid])[2]])[0]+ ")").css("color","white");
		$lineTop.append(colortd2);
	}
	else if(piece.name != "總分"){
		$lineTop.append(td("尚未收錄", "area"));
		$lineTop.append(td("尚未收錄", "color1"));
		$lineTop.append(td("尚未收錄", "color2"));
	}
	$lineTop.append(td(render(identity.type), 'category'));
	$lineTop.append(td(render(identity.id), 'id'));

	if (isShoppingCart) {
		if (piece.id) {
			$lineTop.append(td(removeShoppingCartButton(/** @type {ScoringClothing['type']} */ (piece.type).type, index), 'icon'));
		}
	} else {
		$lineTop.append(td(shoppingCartButton(/** @type {ScoringClothing} */ (piece), 1), 'icon'));
		$lineTop.append(td(shoppingCartButton(/** @type {ScoringClothing} */ (piece), 2), 'icon'));
	}
	//$row.append($lineTop);
	return $lineTop;
}

/**
 * @param {ScoringClothing[]} datas
 * @param {boolean} isShoppingCart
 * @param {number} index
 */
function listBiguse(datas, isShoppingCart, index) {
	var $list = Dom("<div>").addClass("table-body");
	if (isShoppingCart) {
		$list.append(rowBiguse(BigUseDomain.cartForIndex(index, shoppingCart1, shoppingCart2).totalScore, isShoppingCart, index));
	}
	for (var i in datas) {
		var $row = rowBiguse(/** @type {ScoringClothing} */ (datas[i]), isShoppingCart, index);
		// 在 shoppingCart 中為所有數據行的第一個 table-td（複製按鈕欄位）添加複製按鈕
		// 總分行（第一行）不需要按鈕，所以從 i >= 0 開始（因為總分行已經在前面添加了）
		if (isShoppingCart) {
			var $copyTd = $row.find('.table-td').eq(0);
			if ($copyTd.length > 0) {
				$copyTd.append(copyButton());
			}
		}
		$list.append($row);
	}
	return $list;
}

/**
 * @param {ScoringClothing} piece
 */
function clothesNameTd(piece) {
	var cls = "name table-td";
	var deps = piece.getDeps('   ', 1);
	var tooltip = '';
	if (deps && deps.length > 0) {
		tooltip = deps;
		if (deps.indexOf('需') > 0) {
			cls += ' deps';
		}
	}
	cls += piece.own ? ' own' : '';

	var $clothesNameA = Dom("<a>").attr("href", "#").addClass("button");
	$clothesNameA.text(piece.name);
	if(tooltip != ''){
		$clothesNameA.attr("tooltip",tooltip);

	}
	$clothesNameA.click(function () {
		toggleInventory(piece.type.mainType, piece.id, this);
		return false;
	});
	var $clothesNameTd = Dom("<div>");
	$clothesNameTd.attr("id", "clickable-" + (piece.type.mainType + piece.id));
	$clothesNameTd.addClass(cls);
	$clothesNameTd.append($clothesNameA);
	return $clothesNameTd;
}

/**
 * @param {ScoringClothing} piece
 * @param {number} index
 */
function shoppingCartButton(piece, index) {
	var $shoppingCartButton = Dom("<button>").addClass("btn btn-default").text(index == 1 ? "A" : "B");
	var tShoppingCart = BigUseDomain.cartForIndex(index, shoppingCart1, shoppingCart2);
	$shoppingCartButton.click(function () {
		tShoppingCart.put(piece);
		refreshShoppingCartBiguse();
	});
	return $shoppingCartButton;
}

/**
 * @param {string} detailedType
 * @param {number} index
 */
function removeShoppingCartButton(detailedType, index) {
	var $removeShoppingCartButton = Dom("<button>").addClass('glyphicon glyphicon-trash btn btn-xs btn-default');
	var tShoppingCart = BigUseDomain.cartForIndex(index, shoppingCart1, shoppingCart2);
	$removeShoppingCartButton.click(function () {
		tShoppingCart.remove(detailedType);
		refreshShoppingCartBiguse();
	});
	return $removeShoppingCartButton;
}

function refreshShoppingCartBiguse() {
	shoppingCart1.calc(criteria);
	shoppingCart2.calc(criteria);
	drawTable(shoppingCart1.toList(byCategoryAndScore), "shoppingCart1", true, 1);
	drawTable(shoppingCart2.toList(byCategoryAndScore), "shoppingCart2", true, 2);
	var comparison = BigUseDomain.compareScores(shoppingCart1.totalScore.sumScore, shoppingCart2.totalScore.sumScore);
	if(comparison.close){
		Dom("#advise").text("當前兩種搭配分值過於接近, 建議去詢問群裡的小夥伴後再選擇");
	}
	else{
		var info = "搭配A:" + comparison.scoreA + "分, 搭配B: " + comparison.scoreB + "分, 當前搭配情況下選擇   [" + comparison.winner + "]    ";
		Dom("#advise").text(info);
	}
}

/**
 * @param {ScoringClothing[]} data
 * @param {string} divId
 * @param {boolean} isShoppingCart
 * @param {number} index
 */
function drawTable(data, divId, isShoppingCart, index) {
	if(divId != "shoppingCart"){
		var $table = Dom('#' + divId);
		$table.empty();
		$table.append(theadBiguse(isShoppingCart));
		$table.append(listBiguse(data, isShoppingCart, index));
		return;
	}
	var $table = Dom('#' + divId + "1");
	$table.empty();
	$table.append(theadBiguse(isShoppingCart));
	$table.append(listBiguse([], isShoppingCart, 1));
	var $table2 = Dom('#' + divId + "2");
	$table2.empty();
	$table2.append(theadBiguse(isShoppingCart));
	$table2.append(listBiguse([], isShoppingCart, 2));
}


function initAutoComplete(){
	/** @param {string} query */
	var match = function(query){
		return BigUseDomain.autocompleteSuggestions(clothes, query);
	};
	NativeAutocomplete.attach(document.getElementById('autocomplete1'), {
		lookup: match,
		onSelect: function (suggestion) {
			shoppingCart1.put(suggestion.data);
			refreshShoppingCartBiguse();
		}
	});
	NativeAutocomplete.attach(document.getElementById('autocomplete2'), {
		lookup: match,
		onSelect: function (suggestion) {
			shoppingCart2.put(suggestion.data);
			refreshShoppingCartBiguse();
		}
	});
	Dom('#imgInfo').click(function () {
		Dom("#imgModel").hide();
	});
}


export {
  copyNameText, copyButton, theadBiguse, rowBiguse, listBiguse, clothesNameTd,
  shoppingCartButton, removeShoppingCartButton, refreshShoppingCartBiguse, drawTable, initAutoComplete
};
