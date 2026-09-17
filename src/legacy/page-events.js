(function (root) {
  'use strict';

  function byId(id) { return document.getElementById(id); }
  function bind(id, eventName, handler) {
    var el = byId(id);
    if (el) el.addEventListener(eventName, handler);
  }
  function call(name) {
    return function (event) {
      if (event && event.preventDefault && event.currentTarget && event.currentTarget.tagName === 'A') event.preventDefault();
      if (root.MainActions && typeof root.MainActions.run === 'function') {
        return root.MainActions.run(name);
      }
    };
  }
  function syncBootstrapButtons() {
    var groups = document.querySelectorAll('[data-toggle="buttons"]');
    for (var i = 0; i < groups.length; i++) {
      groups[i].addEventListener('change', function (event) {
        var input = event.target;
        if (!input || !input.matches('input[type="radio"], input[type="checkbox"]')) return;
        var label = input.closest('label');
        if (!label) return;
        if (input.type === 'radio') {
          var labels = this.querySelectorAll('label.active');
          for (var j = 0; j < labels.length; j++) labels[j].classList.remove('active');
          if (input.checked) label.classList.add('active');
        } else {
          label.classList.toggle('active', input.checked);
        }
      });
    }
  }
  function bindFilterEvents() {
    bind('theme-fliter', 'change', call('reDrawTheme'));
    bind('theme', 'change', call('changeTheme'));
    var changeFilterIds = ['simpleWeight', 'cuteWeight', 'activeWeight', 'pureWeight', 'coolWeight', 'tag1', 'tag1base', 'tag1weight', 'tag2', 'tag2base', 'tag2weight'];
    for (var i = 0; i < changeFilterIds.length; i++) bind(changeFilterIds[i], 'change', call('changeFilter'));
  }
  function bindInventoryEvents() {
    bind('importCate', 'change', call('clearImport'));
    bind('btn-import', 'click', call('doImport'));
    bind('btn-load-custom-inventory', 'click', call('loadCustomInventory'));
  }
  function bindMainEvents() {
    bind('aaa', 'click', call('getWardrobe'));
    bind('searchResultCheck', 'click', call('toggleSearchResult'));
    bind('btn-search-result', 'click', call('searchResult'));
    bind('btn-clear-shopping-cart', 'click', call('clearShoppingCart'));
    bind('btn-save-text', 'click', call('saveTextAsFile'));
    bind('btn-load-file', 'click', call('loadFileAsText'));
  }
  function toggleMaterialIntro() {
    var intro = byId('intro');
    var link = byId('aIntro');
    if (!intro || !link) return;
    var opening = intro.style.display === 'none';
    intro.style.display = opening ? 'inline' : 'none';
    link.textContent = opening ? '<收起>' : '<展開>';
    if (typeof Storage !== 'undefined') localStorage.setItem('nikki_ZHCX_hideIntro', opening ? 0 : 1);
  }
  function bindMaterialEvents() {
    var lastUpdated = byId('lastupd');
    if (lastUpdated && typeof root.wardrobe_lastupd !== 'undefined') {
      lastUpdated.textContent = String(root.wardrobe_lastupd).replace('/', '-').replace('/', '-');
    }
    var links = document.getElementsByTagName('a');
    for (var i = links.length - 1; i >= 0; i--) {
      if (links[i].getAttribute('tooltip')) links[i].style.display = 'none';
    }
    bind('aIntro', 'click', function (event) { event.preventDefault(); toggleMaterialIntro(); });
    if (typeof Storage !== 'undefined' && localStorage.getItem('nikki_ZHCX_hideIntro') > 0) toggleMaterialIntro();
  }
  function init() {
    syncBootstrapButtons();
    bindFilterEvents();
    bindInventoryEvents();
    bindMainEvents();
    bindMaterialEvents();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
