document.addEventListener('DOMContentLoaded', function () {
	var mine = loadFromStorage();
	drawFilter();
	switchCate(0);
	updateSize(mine);
});

var clothes = function() {
  var ret = [];
  for (var i in wardrobe) {
    ret.push(retClothes(wardrobe[i]));
  }
  return ret;
}();

function retClothes(csv){
	var item = WardrobeDomain.rowToWardrobeItem(csv);
	return {
		own: false,
		name: item.name,
		type: item.type,
		mainType: item.type.split('-')[0],
		id: item.id,
	}
}

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

/*check cookie for own clothes - start*/

function updateSize(mine) {
	var textarea = document.getElementById('myClothes');
	if (textarea) textarea.value = mine.serialize();
	var subcount = {};
	for (var c in mine.mine) {
		var type = c.split('-')[0];
		if (!subcount[type]) {
			subcount[type] = 0;
		}
		subcount[type] += mine.mine[type].length;
	}
	for (var c in subcount) {
		var badge = document.querySelector('#' + c + '>a span');
		if (badge) badge.textContent = subcount[c];
	}
}

function MyClothes() {
  return InventoryDomain.createInventory({
    typeOf: function (clothing) { return clothing.mainType; }
  });
}

function load(myClothes) {
  var cs = myClothes.split(",");
  for (var i in clothes) {
    clothes[i].own = false;
    if (cs.indexOf(clothes[i].name) >= 0) {
      clothes[i].own = true;
    }
  }
  var mine = MyClothes();
  mine.filter(clothes);
  return mine;
}

function loadNew(myClothes) {
  var mine = MyClothes();
  mine.deserialize(myClothes);
  mine.update(clothes);
  return mine;
}

function loadFromStorage() {
  var storage = typeof localStorage !== 'undefined' ? localStorage : null;
  var stored = InventoryDomain.readBrowser(storage, document);
  if (stored.current) return loadNew(stored.current);
  if (stored.legacy) return load(stored.legacy);
  return MyClothes();
}

/*check cookie for own clothes - end*/

function drawFilter() {
	var out = "<ul class='nav nav-tabs nav-justified' id='categoryTab'>";
	for (var c in CATEGORY_HIERARCHY) {
		out += '<li id="' + c + '"><a href="javascript:void(0)" onClick="switchCate(\'' + c + '\')">' + c + '&nbsp;&nbsp;<span class="badge">0</span></a></li>';
	}
	out += "</ul>";
	var container = document.getElementById('category_container');
	if (container) container.innerHTML = out;
}

function switchCate(c) {
	var searchList = document.getElementById('searchResultList');
	if (searchList) searchList.innerHTML = '';
	var currentCategory = c;
	var active = document.querySelectorAll('ul#categoryTab li.active, #category_container div.active');
	for (var i = 0; i < active.length; i++) active[i].classList.remove('active');
	var tab = document.getElementById(String(c));
	var categoryPanel = document.getElementById('category-' + c);
	if (tab) tab.classList.add('active');
	if (categoryPanel) categoryPanel.classList.add('active');
	rebuildCate(currentCategory);
	return false;
}

function rebuildCate(currentCategory){
	var ret = [];
	for (var i in clothes){
		if (clothes[i].mainType != currentCategory) continue;
		if (!clothes[i].own) continue;
		ret.push([clothes[i].id,clothes[i].name]);
	}
	ret.sort(function(a,b){return a[0] - b[0]});
	
	var check_container_left='';
	var check_container_right='';
	var tmp='';
	for (var i in ret){
		tmp = ret[i][0] + '&nbsp;' + ret[i][1] + '<br>'; // '&#9;&#9;';
		if (i%2>0) check_container_right += tmp;
		else check_container_left += tmp;
	}
	var left = document.getElementById('check_container_left');
	var right = document.getElementById('check_container_right');
	if (left) left.innerHTML = check_container_left;
	if (right) right.innerHTML = check_container_right;
}