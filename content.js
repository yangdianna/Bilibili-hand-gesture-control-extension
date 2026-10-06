// Content script (ISOLATED world). Minimal responsibilities:
//   1. Inject all application modules + MediaPipe hands.js into the page's MAIN world
//      as <script> tags, in dependency order. MediaPipe internally injects its own
//      <script> tags (WASM glue + assets loader) which run in the MAIN world, so
//      hands.js MUST also run in the MAIN world for their shared globals to connect.
//   2. Bridge popup messaging (chrome.runtime is only available here) to the MAIN
//      world via CustomEvents and the shared document.documentElement.dataset.

(function () {
  var BASE = chrome.runtime.getURL('');

  // Pass the extension base URL to MAIN-world scripts via the shared DOM.
  document.documentElement.dataset.bgBase = BASE;

  var SCRIPTS = [
    'src/util/dom.js',
    'src/util/rect-tracker.js',
    'src/gesture/gestures.js',
    'src/camera/camera-manager.js',
    'src/gesture/engine.js',
    'src/gesture/classifier.js',
    'src/action/action-mapper.js',
    'src/panel/panel.js',
    'src/vendor/hands.js',
    'src/inject.js',
  ];

  function inject(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = BASE + src;
      s.setAttribute('data-bg', '1');
      s.onload = resolve;
      s.onerror = function () { reject(new Error('failed to load ' + src)); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function arrayBufferToDataUrl(buf, mime) {
    var bytes = new Uint8Array(buf);
    var bin = '';
    var CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return 'data:' + mime + ';base64,' + btoa(bin);
  }

  // Prefetch MediaPipe binary files (wasm + packed assets) in this isolated world,
  // convert to data: URLs (which bypass the page CSP connect-src), and hand them to
  // the MAIN-world engine via a CustomEvent.
  async function prefetchVendorBinaries() {
    var files = [
      ['hands_solution_simd_wasm_bin.wasm', 'application/wasm'],
      ['hands_solution_packed_assets.data', 'application/octet-stream'],
    ];
    var urls = {};
    for (var i = 0; i < files.length; i++) {
      var f = files[i][0], mime = files[i][1];
      try {
        var resp = await fetch(BASE + 'src/vendor/' + f);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var buf = await resp.arrayBuffer();
        urls[f] = arrayBufferToDataUrl(buf, mime);
        console.log('[bg] prefetched', f, buf.byteLength, 'bytes');
      } catch (e) {
        console.error('[bg] prefetch failed:', f, e.message);
      }
    }
    document.dispatchEvent(new CustomEvent('bg-vendor-ready', { detail: urls }));
  }

  async function boot() {
    if (document.documentElement.dataset.bgBooted) return;
    document.documentElement.dataset.bgBooted = '1';
    // Inject scripts FIRST so that inject.js's GestureEngine constructor registers
    // its 'bg-vendor-ready' listener before we dispatch that event below. Otherwise
    // the event fires too early, gets missed, and engine.init polls forever.
    for (var i = 0; i < SCRIPTS.length; i++) {
      try { await inject(SCRIPTS[i]); }
      catch (e) { console.error('[bg] inject:', e.message); }
    }
    console.log('[bg] injected', SCRIPTS.length, 'scripts into MAIN world');
  }

  function readState() {
    try {
      var raw = document.documentElement.dataset.bgState;
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { state: 'idle', running: false, gesture: 'none', gestureZh: '—' };
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg) return false;
    if (msg.type === 'bg-get-state') {
      sendResponse(readState());
    } else if (msg.type === 'bg-toggle') {
      document.dispatchEvent(new CustomEvent('bg-command', { detail: { type: 'toggle' } }));
      sendResponse(readState());
    }
    return false;
  });

  boot();
})();
