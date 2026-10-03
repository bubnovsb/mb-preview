// Link-only access: gets the content key from the URL fragment or this tab's session.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var STORE = 'mb-review-key';

  function fromB64(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function toB64url(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function importKey(raw) {
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  }
  function open(key, buf) {
    var b = new Uint8Array(buf);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, key, b.subarray(12));
  }
  function remember(raw) { try { sessionStorage.setItem(STORE, toB64url(raw)); } catch (e) {} }
  function forget() { try { sessionStorage.removeItem(STORE); } catch (e) {} }

  async function start(raw) {
    var key = await importKey(raw);
    var res = await fetch('a/app.bin?v=20261003b');
    if (!res.ok) throw new Error('network');
    var app = JSON.parse(new TextDecoder().decode(await open(key, await res.arrayBuffer())));
    var cache = {};
    window.__site = {
      slides: app.slides,
      built: app.built,
      theme: app.theme,
      has: function (name) { return !!app.manifest[name]; },
      // decrypted file as a blob: URL
      asset: function (name) {
        if (!cache[name]) {
          var m = app.manifest[name];
          if (!m) return Promise.reject(new Error('no asset ' + name));
          cache[name] = fetch('a/' + m.f + '.bin')
            .then(function (r) { return r.arrayBuffer(); })
            .then(function (b) { return open(key, b); })
            .then(function (b) { return URL.createObjectURL(new Blob([b], { type: m.t })); });
        }
        return cache[name];
      },
      lock: function () { forget(); location.replace(location.pathname + '?locked=1'); }
    };
    var style = document.createElement('style');
    style.textContent = app.css;
    document.head.appendChild(style);
    var script = document.createElement('script');
    script.src = URL.createObjectURL(new Blob([app.js], { type: 'text/javascript' }));
    document.body.appendChild(script);
  }

  function ask(msg) {
    $('gate-loading').hidden = true;
    $('gate-ask').hidden = false;
    $('gate-msg').textContent = msg || '';
    $('gate-title').focus();
  }

  async function tryKey(text) {
    var raw = fromB64(text);
    if (raw.length !== 32) throw new Error('key');
    await start(raw);
    remember(raw);
    if (location.hash.includes('k=')) history.replaceState(null, '', location.pathname + location.search);
  }

  (async function () {
    if (!window.crypto || !crypto.subtle) {
      return ask('This browser cannot open the page. Please use a current browser over https.');
    }
    var m = /[#&]k=([A-Za-z0-9_-]+)/.exec(location.hash);
    var saved = null;
    try { saved = sessionStorage.getItem(STORE); } catch (e) {}
    var candidates = [m && m[1], saved].filter(Boolean);
    if (!candidates.length) return ask('Откройте полную приватную ссылку, которую вам прислали. · Open the complete private link you received.');
    $('gate-loading').hidden = false;
    for (var i = 0; i < candidates.length; i++) {
      try { await tryKey(candidates[i]); return; } catch (e) {}
    }
    forget();
    ask(m ? 'Ссылка недействительна или повреждена. Попросите новую полную ссылку. · This link is invalid or incomplete.' : '');
  })();
})();
