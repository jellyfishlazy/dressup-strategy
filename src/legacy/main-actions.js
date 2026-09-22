(function (root) {
  'use strict';

  var registry = Object.create(null);

  function register(actions) {
    for (var name in actions) {
      if (typeof actions[name] !== 'function') throw new TypeError('Main action must be a function: ' + name);
      registry[name] = actions[name];
    }
  }

  function run(name) {
    var fn = registry[name];
    if (typeof fn !== 'function') return;
    return fn();
  }

  root.MainActions = Object.freeze({ register: register, run: run });
})(typeof globalThis !== 'undefined' ? globalThis : this);
