// Small local autocomplete used by BigUse after retiring the jQuery plugin.
(function (root) {
  'use strict';

  function NativeAutocomplete(input, options) {
    this.input = input;
    this.options = options || {};
    this.suggestions = [];
    this.selectedIndex = -1;
    this.container = document.createElement('div');
    this.container.className = 'autocomplete-suggestions native-autocomplete-suggestions';
    this.container.style.display = 'none';
    document.body.appendChild(this.container);
    this.bind();
  }

  NativeAutocomplete.prototype.lookup = function () {
    var query = this.input.value || '';
    if (!query) {
      this.hide();
      return;
    }
    var result = this.options.lookup ? this.options.lookup(query) : [];
    this.suggestions = Array.isArray(result) ? result : [];
    this.selectedIndex = -1;
    this.render();
  };

  NativeAutocomplete.prototype.position = function () {
    var rect = this.input.getBoundingClientRect();
    this.container.style.left = (rect.left + (window.scrollX || 0)) + 'px';
    this.container.style.top = (rect.bottom + (window.scrollY || 0)) + 'px';
    this.container.style.width = Math.max(rect.width, 180) + 'px';
  };

  NativeAutocomplete.prototype.render = function () {
    this.container.replaceChildren();
    if (!this.suggestions.length) {
      this.hide();
      return;
    }
    this.position();
    var self = this;
    var max = Math.min(this.suggestions.length, 30);
    for (var i = 0; i < max; i++) {
      (function (index) {
        var suggestion = self.suggestions[index];
        var item = document.createElement('div');
        item.className = 'autocomplete-suggestion';
        item.textContent = suggestion.value;
        item.dataset.index = String(index);
        item.addEventListener('mousedown', function (event) {
          event.preventDefault();
          self.select(index);
        });
        self.container.appendChild(item);
      })(i);
    }
    this.container.style.display = 'block';
  };

  NativeAutocomplete.prototype.activate = function (index) {
    var items = this.container.querySelectorAll('.autocomplete-suggestion');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('autocomplete-selected');
    if (index < 0 || index >= items.length) {
      this.selectedIndex = -1;
      return;
    }
    this.selectedIndex = index;
    items[index].classList.add('autocomplete-selected');
    items[index].scrollIntoView({ block: 'nearest' });
  };

  NativeAutocomplete.prototype.select = function (index) {
    var suggestion = this.suggestions[index];
    if (!suggestion) return;
    this.input.value = suggestion.value;
    this.hide();
    if (this.options.onSelect) this.options.onSelect(suggestion);
  };

  NativeAutocomplete.prototype.hide = function () {
    this.container.style.display = 'none';
    this.selectedIndex = -1;
  };

  NativeAutocomplete.prototype.bind = function () {
    var self = this;
    this.input.setAttribute('autocomplete', 'off');
    this.input.addEventListener('input', function () { self.lookup(); });
    this.input.addEventListener('focus', function () { if (self.input.value) self.lookup(); });
    this.input.addEventListener('keydown', function (event) {
      if (self.container.style.display === 'none') return;
      var max = Math.min(self.suggestions.length, 30);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        self.activate(Math.min(self.selectedIndex + 1, max - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        self.activate(Math.max(self.selectedIndex - 1, 0));
      } else if (event.key === 'Enter' && self.selectedIndex >= 0) {
        event.preventDefault();
        self.select(self.selectedIndex);
      } else if (event.key === 'Escape') {
        self.hide();
      }
    });
    this.input.addEventListener('blur', function () {
      window.setTimeout(function () { self.hide(); }, 100);
    });
    window.addEventListener('resize', function () {
      if (self.container.style.display !== 'none') self.position();
    });
  };

  root.NativeAutocomplete = {
    attach: function (input, options) {
      if (!input) return null;
      return new NativeAutocomplete(input, options);
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
