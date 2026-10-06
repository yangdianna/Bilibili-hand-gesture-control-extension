// Bootstrap — runs in the MAIN world (last script injected by content.js).
// Finds <video>, mounts the panel, wires camera + MediaPipe + gestures + actions,
// handles SPA route changes, and bridges commands/state with the content script
// (which owns the popup) via CustomEvents and document.documentElement.dataset.

window.BG = window.BG || {};
(() => {
  const { waitForSelector } = BG.dom;
  const { Panel } = BG;
  const { CameraManager } = BG;
  const { GestureEngine } = BG;
  const { GestureClassifier } = BG;
  const { classify, wristX, wristY } = BG;
  const { bindActions } = BG;

  if (window.__BG_BOOTED__) return;
  window.__BG_BOOTED__ = true;

  const state = {
    panel: null, camera: null, engine: null, classifier: null, videoEl: null,
    raf: 0, sendEveryN: 0, sendInterval: 2, lastUrl: location.href,
  };

  function publishState() {
    const camState = state.camera ? state.camera.state : 'idle';
    const raw = state.classifier ? state.classifier.currentLabel : 'none';
    try {
      document.documentElement.dataset.bgState = JSON.stringify({
        state: camState,
        running: camState === 'running',
        gesture: raw,
        gestureZh: BG.labelZh(raw),
      });
    } catch (e) { /* ignore */ }
  }

  function bootstrap() {
    state.panel = new Panel();
    state.panel.mount(document.body);
    state.panel.setCameraState('idle');
    state.panel.setGesture('none');

    state.camera = new CameraManager();
    state.engine = new GestureEngine();
    state.classifier = new GestureClassifier();

    state.camera.on('state', ({ state: cs, errMsg }) => {
      state.panel.setCameraState(cs, errMsg);
      publishState();
    });
    state.camera.on('fps', fps => state.panel.setFps(fps));
    state.camera.on('started', () => state.engine.init({ onResults: onResults }).catch(handleEngineError));
    state.camera.on('started', () => startFrameLoop());
    state.camera.on('started', () => state.panel.setCameraStream(state.camera.getStream()));
    state.camera.on('stopped', () => {
      state.panel.setCameraStream(null);
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = 0;
      publishState();
    });

    // Pause recognition when tab is hidden.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && state.camera.state === 'running') {
        state.camera.pause();
      }
    });

    state.classifier.on('label', label => {
      state.panel.setGesture(label);
      publishState();
    });

    state.panel.on('toggle', () => onToggle());
    state.panel.on('collapse', () => {});
    state.panel.on('expand', () => state.panel._noteInteraction());

    // Commands from the content script (popup).
    document.addEventListener('bg-command', (e) => {
      const d = e && e.detail;
      if (d && d.type === 'toggle') onToggle();
    }, true);

    hookSpa();
    waitForVideo().then(video => attachToVideo(video)).catch(err => console.warn('[bg] no <video> yet:', err.message));
  }

  function waitForVideo() {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('video');
      if (existing) return resolve(existing);
      const obs = new MutationObserver(() => {
        const v = document.querySelector('video');
        if (v) { obs.disconnect(); resolve(v); }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error('waitForVideo timeout')); }, 60_000);
    });
  }

  function attachToVideo(videoEl) {
    state.videoEl = videoEl;
    state.panel.attachToVideo(videoEl);
    bindActions(videoEl, state.classifier, state.panel);
    console.log('[bg] attached to <video>');
  }

  function onToggle() {
    const s = state.camera.state;
    if (s === 'idle' || s === 'error') state.camera.start().catch(() => {});
    else if (s === 'running') state.camera.pause();
    else if (s === 'paused') state.camera.resume();
  }

  function handleEngineError(err) {
    console.error('[bg] engine init failed:', err);
    state.panel.setCameraState('error', '手势识别初始化失败：' + (err?.message || err));
    state.camera.stop();
    publishState();
  }

  function onResults(results) {
    if (!onResults._firstLogged) {
      onResults._firstLogged = true;
      console.log('[bg] first onResults fired. multiHandLandmarks len:', results?.multiHandLandmarks?.length ?? 0);
    }
    const lms = results?.multiHandLandmarks?.[0];
    if (!lms || !lms.length) {
      state.classifier.notifyLost();
      return;
    }
    // 调试：每秒打印一次"张开度 + 伸直手指数"，用于调 PALM_SPREAD_THRESHOLD。
    if (!onResults._spreadLog || performance.now() - onResults._spreadLog > 1000) {
      onResults._spreadLog = performance.now();
      console.log('[bg] spread:', BG.fingerSpread(lms).toFixed(3), 'label:', classify(lms));
    }
    const label = classify(lms);
    const meta = {};
    if (label === 'fist' && state.videoEl) {
      meta.x = wristX(lms);
      meta.y = wristY(lms);
      meta.currentTime = state.videoEl.currentTime;
      meta.volume = state.videoEl.volume;
    }
    state.classifier.feed(label, meta);
  }

  function startFrameLoop() {
    if (state.raf) return;
    let loggedVideo = false;
    const tick = () => {
      state.raf = requestAnimationFrame(tick);
      const src = state.camera.getSourceElement();
      if (!src) return;
      if (!loggedVideo) {
        loggedVideo = true;
        console.log('[bg] source video dims:', src.videoWidth, 'x', src.videoHeight, 'readyState:', src.readyState);
      }
      state.sendEveryN = (state.sendEveryN + 1) % state.sendInterval;
      if (state.sendEveryN === 0) state.engine.send(src);
    };
    tick();
  }

  function hookSpa() {
    const _push = history.pushState.bind(history);
    const _replace = history.replaceState.bind(history);
    history.pushState = function (...a) { const r = _push(...a); onUrlChange(); return r; };
    history.replaceState = function (...a) { const r = _replace(...a); onUrlChange(); return r; };
    window.addEventListener('popstate', onUrlChange);
  }

  function onUrlChange() {
    if (location.href === state.lastUrl) return;
    state.lastUrl = location.href;
    const v = document.querySelector('video');
    if (v && v !== state.videoEl) attachToVideo(v);
    else if (!v) waitForVideo().then(video => attachToVideo(video)).catch(() => {});
  }

  bootstrap();
})();
