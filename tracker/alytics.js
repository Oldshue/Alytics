/**
 * Alytics Tracker v0.1
 * Drop-in analytics script. Configure with:
 *   window._alytics = { key: 'aly_YOUR_API_KEY', host: 'https://your-alytics-instance.com' }
 * Usage:
 *   alytics.track('button_click', { label: 'signup' })
 */
(function (window, document) {
  'use strict';

  var cfg = window._alytics || {};
  var ENDPOINT = (cfg.host || '').replace(/\/$/, '');
  var SITE_KEY = cfg.key;

  if (!SITE_KEY) {
    console.warn('[Alytics] No key set. Add window._alytics = { key: "aly_..." } before this script.');
    return;
  }

  function uid() {
    try { return crypto.randomUUID(); } catch (e) {
      return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }
  }

  function getVisitorId() {
    var k = '_aly_v';
    try {
      var v = localStorage.getItem(k);
      if (!v) { v = uid(); localStorage.setItem(k, v); }
      return v;
    } catch (e) { return uid(); }
  }

  function getSessionId() {
    var k = '_aly_s', ek = '_aly_e';
    try {
      var now = Date.now();
      var exp = parseInt(sessionStorage.getItem(ek) || '0');
      var s = sessionStorage.getItem(k);
      if (!s || now > exp) { s = uid(); sessionStorage.setItem(k, s); }
      sessionStorage.setItem(ek, String(now + 1800000)); // refresh 30-min window
      return s;
    } catch (e) { return uid(); }
  }

  function send(payload) {
    var url = ENDPOINT + '/api/track';
    var body = JSON.stringify(payload);
    var sent = false;

    if (navigator.sendBeacon) {
      try {
        sent = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      } catch (e) {}
    }

    if (!sent) {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true
      }).catch(function () {});
    }
  }

  var lastPath = null;

  function trackPageview() {
    var path = location.pathname + location.search;
    if (path === lastPath) return;
    lastPath = path;

    send({
      key: SITE_KEY,
      type: 'pageview',
      visitor_id: getVisitorId(),
      session_id: getSessionId(),
      path: path,
      url: location.href,
      referrer: document.referrer || '',
      title: document.title || ''
    });
  }

  // Track on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackPageview);
  } else {
    trackPageview();
  }

  // SPA support (history.pushState + popstate)
  (function () {
    var orig = history.pushState;
    history.pushState = function () {
      orig.apply(this, arguments);
      setTimeout(trackPageview, 0);
    };
    window.addEventListener('popstate', function () { setTimeout(trackPageview, 0); });
  })();

  // Public API
  window.alytics = {
    track: function (name, props) {
      send({
        key: SITE_KEY,
        type: 'event',
        visitor_id: getVisitorId(),
        session_id: getSessionId(),
        name: name || 'event',
        props: props || {}
      });
    }
  };

})(window, document);
