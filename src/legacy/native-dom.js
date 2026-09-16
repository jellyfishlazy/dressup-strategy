// Small native-DOM facade used only by the migrated main matcher runtime.
// It intentionally implements the narrow operations the legacy scripts need,
// without loading jQuery or exposing a global `$`/`jQuery` alias.
(function (root) {
  'use strict';

  function normalizeSelector(selector) {
    var firstOnly = /:first\b/.test(selector);
    var normalized = selector
      .replace(/:radio\b/g, '[type="radio"]')
      .replace(/:checkbox\b/g, '[type="checkbox"]')
      .replace(/:selected\b/g, ':checked')
      .replace(/:first\b/g, '');
    return { selector: normalized, firstOnly: firstOnly };
  }

  function select(selector, context) {
    var parsed = normalizeSelector(selector);
    var scope = context || document;
    var nodes = Array.from(scope.querySelectorAll(parsed.selector));
    return parsed.firstOnly ? nodes.slice(0, 1) : nodes;
  }

  function toNodes(value) {
    if (value == null) return [];
    if (value instanceof NativeDomCollection) return value.nodes.slice();
    if (value.nodeType || value === window || value === document) return [value];
    if (Array.isArray(value) || (typeof value.length === 'number' && typeof value !== 'string')) {
      return Array.from(value);
    }
    if (typeof value === 'string') {
      var trimmed = value.trim();
      if (trimmed.charAt(0) === '<' && trimmed.charAt(trimmed.length - 1) === '>') {
        var template = document.createElement('template');
        template.innerHTML = trimmed.replace(/^<([a-zA-Z0-9-]+)\/>$/, '<$1></$1>');
        return Array.from(template.content.childNodes);
      }
      return select(value);
    }
    return [];
  }

  function appendValue(target, value, prepend) {
    if (value == null) return;
    if (typeof value === 'string') {
      if (/<[^>]+>/.test(value)) {
        var template = document.createElement('template');
        template.innerHTML = value;
        var htmlNodes = Array.from(template.content.childNodes);
        for (var h = 0; h < htmlNodes.length; h++) {
          if (prepend) target.insertBefore(htmlNodes[h], target.firstChild);
          else target.appendChild(htmlNodes[h]);
        }
        return;
      }
      var text = document.createTextNode(value);
      if (prepend) target.insertBefore(text, target.firstChild);
      else target.appendChild(text);
      return;
    }
    var nodes = toNodes(value);
    for (var i = 0; i < nodes.length; i++) {
      if (prepend) target.insertBefore(nodes[i], target.firstChild);
      else target.appendChild(nodes[i]);
    }
  }

  function NativeDomCollection(nodes) {
    this.nodes = nodes || [];
    this.length = this.nodes.length;
    for (var i = 0; i < this.nodes.length; i++) this[i] = this.nodes[i];
  }

  NativeDomCollection.prototype.each = function (callback) {
    for (var i = 0; i < this.nodes.length; i++) callback.call(this.nodes[i], i, this.nodes[i]);
    return this;
  };
  NativeDomCollection.prototype.get = function (index) { return this.nodes[index]; };
  NativeDomCollection.prototype.eq = function (index) { return new NativeDomCollection(this.nodes[index] ? [this.nodes[index]] : []); };
  NativeDomCollection.prototype.find = function (selector) {
    var out = [];
    for (var i = 0; i < this.nodes.length; i++) out = out.concat(select(selector, this.nodes[i]));
    return new NativeDomCollection(out);
  };
  NativeDomCollection.prototype.closest = function (selector) {
    var out = [];
    for (var i = 0; i < this.nodes.length; i++) {
      var found = this.nodes[i].closest ? this.nodes[i].closest(selector) : null;
      if (found && out.indexOf(found) < 0) out.push(found);
    }
    return new NativeDomCollection(out);
  };
  NativeDomCollection.prototype.parent = function () {
    var out = [];
    for (var i = 0; i < this.nodes.length; i++) {
      var parent = this.nodes[i].parentElement;
      if (parent && out.indexOf(parent) < 0) out.push(parent);
    }
    return new NativeDomCollection(out);
  };
  NativeDomCollection.prototype.addClass = function (names) {
    var tokens = String(names || '').split(/\s+/).filter(Boolean);
    return this.each(function () { this.classList.add.apply(this.classList, tokens); });
  };
  NativeDomCollection.prototype.removeClass = function (names) {
    var tokens = String(names || '').split(/\s+/).filter(Boolean);
    return this.each(function () { this.classList.remove.apply(this.classList, tokens); });
  };
  NativeDomCollection.prototype.toggleClass = function (name) { return this.each(function () { this.classList.toggle(name); }); };
  NativeDomCollection.prototype.hasClass = function (name) { return !!(this.nodes[0] && this.nodes[0].classList.contains(name)); };
  NativeDomCollection.prototype.attr = function (name, value) {
    if (typeof name === 'object') {
      var attrs = name;
      return this.each(function () { for (var key in attrs) this.setAttribute(key, attrs[key]); });
    }
    if (arguments.length === 1) return this.nodes[0] ? this.nodes[0].getAttribute(name) : undefined;
    return this.each(function () {
      if (value === undefined || value === null) this.removeAttribute(name);
      else this.setAttribute(name, value);
    });
  };
  NativeDomCollection.prototype.prop = function (name, value) {
    if (value === undefined) return this.nodes[0] ? this.nodes[0][name] : undefined;
    return this.each(function () { this[name] = value; });
  };
  NativeDomCollection.prototype.css = function (name, value) {
    if (typeof name === 'object') {
      var styles = name;
      return this.each(function () { for (var key in styles) this.style[key] = styles[key]; });
    }
    if (value === undefined) {
      if (!this.nodes[0]) return undefined;
      return getComputedStyle(this.nodes[0])[name] || this.nodes[0].style[name];
    }
    return this.each(function () { this.style[name] = value; });
  };
  NativeDomCollection.prototype.text = function (value) {
    if (value === undefined) return this.nodes[0] ? this.nodes[0].textContent : '';
    return this.each(function () { this.textContent = value; });
  };
  NativeDomCollection.prototype.html = function (value) {
    if (value === undefined) return this.nodes[0] ? this.nodes[0].innerHTML : '';
    return this.each(function () { this.innerHTML = value; });
  };
  NativeDomCollection.prototype.val = function (value) {
    if (value === undefined) return this.nodes[0] ? this.nodes[0].value : undefined;
    return this.each(function () { this.value = value; });
  };
  NativeDomCollection.prototype.empty = function () { return this.each(function () { this.replaceChildren(); }); };
  NativeDomCollection.prototype.append = function () {
    var values = arguments;
    return this.each(function () { for (var i = 0; i < values.length; i++) appendValue(this, values[i], false); });
  };
  NativeDomCollection.prototype.prepend = function () {
    var values = arguments;
    return this.each(function () { for (var i = values.length - 1; i >= 0; i--) appendValue(this, values[i], true); });
  };
  NativeDomCollection.prototype.clone = function () {
    return new NativeDomCollection(this.nodes.map(function (node) { return node.cloneNode(true); }));
  };
  NativeDomCollection.prototype.remove = function () { return this.each(function () { if (this.remove) this.remove(); }); };
  NativeDomCollection.prototype.show = function () { return this.each(function () { this.style.display = ''; }); };
  NativeDomCollection.prototype.hide = function () { return this.each(function () { this.style.display = 'none'; }); };
  NativeDomCollection.prototype.toggle = function () {
    return this.each(function () {
      var hidden = getComputedStyle(this).display === 'none';
      this.style.display = hidden ? '' : 'none';
    });
  };
  NativeDomCollection.prototype.is = function (selector) {
    var node = this.nodes[0];
    if (!node) return false;
    if (selector === ':checked') return !!node.checked;
    return node.matches(selector);
  };
  NativeDomCollection.prototype.on = function (eventName, handler) {
    return this.each(function () {
      this.addEventListener(eventName, function (event) {
        if (handler.call(this, event) === false) {
          event.preventDefault();
          event.stopPropagation();
        }
      });
    });
  };
  NativeDomCollection.prototype.click = function (handler) { return handler ? this.on('click', handler) : this.each(function () { this.click(); }); };
  NativeDomCollection.prototype.change = function (handler) { return this.on('change', handler); };
  NativeDomCollection.prototype.keydown = function (handler) { return this.on('keydown', handler); };
  NativeDomCollection.prototype.blur = function () { return this.each(function () { if (this.blur) this.blur(); }); };
  NativeDomCollection.prototype.ready = function (handler) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handler, { once: true });
    else handler();
    return this;
  };
  NativeDomCollection.prototype.animate = function (properties) {
    if (properties && Object.prototype.hasOwnProperty.call(properties, 'scrollTop')) {
      window.scrollTo({ top: Number(properties.scrollTop) || 0, behavior: 'smooth' });
    }
    return this;
  };

  function Dom(value) {
    return new NativeDomCollection(toNodes(value));
  }
  Dom.inArray = function (value, array) { return array.indexOf(value); };
  Dom.each = function (collection, callback) {
    if (Array.isArray(collection) || typeof collection.length === 'number') {
      for (var i = 0; i < collection.length; i++) callback.call(collection[i], i, collection[i]);
    } else {
      for (var key in collection) callback.call(collection[key], key, collection[key]);
    }
    return collection;
  };
  Dom.merge = function (first, second) { Array.prototype.push.apply(first, second); return first; };
  Dom.unique = function (array) { return Array.from(new Set(array)); };
  Dom.isEmptyObject = function (object) { return Object.keys(object).length === 0; };
  Dom.trim = function (value) { return value == null ? '' : String(value).trim(); };

  function syncFixedHeaderWidths(sourceHeader, fixedRoot) {
    if (!sourceHeader || !fixedRoot) return;
    var sourceCells = sourceHeader.querySelectorAll('.table-td');
    var fixedCells = fixedRoot.querySelectorAll('.table-td');
    for (var i = 0; i < Math.min(sourceCells.length, fixedCells.length); i++) {
      var style = getComputedStyle(sourceCells[i]);
      var width = sourceCells[i].getBoundingClientRect().width;
      fixedCells[i].style.width = width + 'px';
      fixedCells[i].style.display = 'inline-block';
      if (!width) {
        fixedCells[i].style.width = (sourceCells[i].offsetWidth + parseFloat(style.paddingLeft || 0) + parseFloat(style.paddingRight || 0)) + 'px';
      }
    }
  }

  function changeFixedHeaderPosition(triggerTop) {
    var fixed = document.getElementById('fixed-header');
    var end = document.getElementById('end');
    if (!fixed || !end) return;
    var scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    fixed.style.visibility = (scrollTop < triggerTop || end.offsetTop < scrollTop) ? 'hidden' : 'visible';
  }

  function bindGoTop(rootNode) {
    var links = (rootNode || document).querySelectorAll('.gogogo-top');
    for (var i = 0; i < links.length; i++) {
      if (links[i].dataset.nativeGoTopBound) continue;
      links[i].dataset.nativeGoTopBound = '1';
      links[i].addEventListener('click', function () { if (typeof root.goTop === 'function') root.goTop(); });
    }
  }

  root.menuFixed = function (id) {
    var previous = document.getElementById('fixed-header');
    if (previous) previous.remove();
    var table = document.getElementById(id);
    if (!table) return;
    var header = table.querySelector('.table-head');
    if (!header) return;
    var fixed = document.createElement('div');
    fixed.id = 'fixed-header';
    fixed.style.visibility = 'hidden';
    fixed.style.top = '0px';
    fixed.style.position = 'fixed';
    fixed.style.zIndex = '1000';
    var tableCopy = document.createElement('div');
    tableCopy.className = 'table';
    tableCopy.style.margin = '0';
    var headerCopy = header.cloneNode(true);
    tableCopy.appendChild(headerCopy);
    fixed.appendChild(tableCopy);
    table.parentNode.insertBefore(fixed, table);
    syncFixedHeaderWidths(header, fixed);
    bindGoTop(fixed);
    var triggerTop = header.getBoundingClientRect().top + (window.scrollY || 0);
    window.onscroll = function () { changeFixedHeaderPosition(triggerTop); };
  };

  root.ReDrawcloneHeaderRow = function () {
    var table = document.getElementById('clothes');
    var fixed = document.getElementById('fixed-header');
    if (!table || !fixed) return;
    var header = table.querySelector('.table-head');
    if (!header) return;
    syncFixedHeaderWidths(header, fixed);
    bindGoTop(fixed);
    var triggerTop = header.getBoundingClientRect().top + (window.scrollY || 0);
    window.onscroll = function () { changeFixedHeaderPosition(triggerTop); };
  };

  root.Dom = Dom;
})(typeof globalThis !== 'undefined' ? globalThis : this);
