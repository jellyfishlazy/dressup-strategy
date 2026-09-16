function chooseAccessories() {
	refreshShoppingCartBiguse();
}


function switchCate(c) {
	currentCategory = c;
	Dom("ul#categoryTab li").removeClass("active");
	Dom("#category_container div").removeClass("active");
	Dom("#" + c).addClass("active");
	Dom("#category-" + c).addClass("active");
	onChangeUiFilter();
	changeFrontFilterDiv(c);
	return false;
}

function changeFrontFilterDiv(c){
	Dom("#front_filter_div").empty();
	Dom("#front_filter_div").append(Dom("<button>").addClass("btn btn-default front_filter_option_biguse").attr("type", "button").text("清空"));
	for(var co in color){
		if(co.indexOf(c) >=0){
			var $btn = Dom("<button>").addClass("btn btn-xs btn-default front_filter_option_biguse").attr("type", "button").text(color[co][1]).css("background", "rgb("+ color[co][0]+ ")").css("color","white").css("margin", "2px").css("padding", "4px").css("font-size", "15px");
			Dom("#front_filter_div").append($btn);
		}
	}
	
	//前台篩選
	Dom(".front_filter_option_biguse").click(function(){
		filterClotherHTMLBiguse(this);
		 return false;
	});
}
	
	
function filterClotherHTMLBiguse(btn){
	var clothesDivList = Dom("#clothes .table-body .table-row");
	var str = Dom(btn).text();
	 for(var i = 0 ; i < clothesDivList.length; i++){
		 if(Dom(clothesDivList[i]).find(".color_search:first").text().indexOf(str) < 0 && str != "清空"){
			Dom(clothesDivList[i]).hide();
		 }
		 else{
			 Dom(clothesDivList[i]).show();
		 }
	 }
}

Dom(document).ready(function () {
	switchCate('妝容');
});
