// Floating panel UI: state, positioning (anchored to video top-right), drag, collapse, auto-fade.

window.BG = window.BG || {};
(() => {
  const { injectStyle, elFromHtml } = BG.dom;
  const { trackRect } = BG;
  const { labelZh } = BG;

  const POS_STORAGE_KEY = 'bili-gesture-panel-pos';
  const OFFSET = 12;
  const FADE_AFTER_MS = 8000;

  class Panel {
    constructor() {
      this.root = elFromHtml(`<div id="bg-root"><div id="bg-panel" class="bg-panel" aria-live="polite">
  <div class="bg-panel__drag" data-role="drag"></div>
  <div class="bg-panel__title">
    <span class="bg-panel__title-text">Bilibili 手势控制</span>
    <button class="bg-panel__collapse" type="button" data-btn="collapse" title="收起">⊙</button>
  </div>
  <div class="bg-panel__body">
    <video class="bg-panel__preview" data-preview autoplay muted playsinline></video>
    <div class="bg-panel__row bg-panel__row--cam" data-state="idle" data-row="cam">
      <span class="bg-panel__row-icon">📷</span>
      <span class="bg-panel__row-text" data-cam-text>摄像头：未启动</span>
      <span class="bg-dot"></span>
    </div>
    <div class="bg-panel__row bg-panel__row--gesture" data-row="gesture">
      <span class="bg-panel__row-icon">✋</span>
      <span class="bg-panel__row-text" data-gesture-text>当前手势：—</span>
    </div>
    <div class="bg-panel__divider"></div>
    <div class="bg-panel__row bg-panel__action" data-action="play">
      <span>▶ 播放/暂停</span>
      <span class="bg-panel__hint">← 手掌</span>
      <span class="bg-panel__dot"></span>
    </div>
    <div class="bg-panel__row bg-panel__action" data-action="volume">
      <span>🔊 音量</span>
      <span class="bg-panel__hint">← 握拳上下滑</span>
      <span class="bg-panel__dot"></span>
    </div>
    <div class="bg-panel__row bg-panel__action" data-action="scrub">
      <span>⏩ 拖动进度</span>
      <span class="bg-panel__hint">← 握拳左右滑</span>
      <span class="bg-panel__dot"></span>
    </div>
    <div class="bg-panel__divider"></div>
    <div class="bg-panel__footer">
      <button class="bg-panel__btn" type="button" data-btn="toggle">开启摄像头</button>
      <button class="bg-panel__btn" type="button" data-btn="collapse">收起</button>
    </div>
  </div>
</div>
<div id="bg-chip" class="bg-chip" title="展开手势面板" data-btn="expand">✋</div></div>`);
      this.panel = this.root.querySelector('#bg-panel');
      this.chip = this.root.querySelector('#bg-chip');
      // CSS injected by content.css (manifest); no JS injection needed.

      this._refs = {
        camText: this.panel.querySelector('[data-cam-text]'),
        camRow: this.panel.querySelector('[data-row="cam"]'),
        gestureText: this.panel.querySelector('[data-gesture-text]'),
        actions: {
          play: this.panel.querySelector('[data-action="play"]'),
          volume: this.panel.querySelector('[data-action="volume"]'),
          scrub: this.panel.querySelector('[data-action="scrub"]'),
        },
      };

      this._lastInteraction = performance.now();
      this._videoEl = null;
      this._stopTracking = null;
      this._collapsed = false;
      this._customPos = null;
      this._dragState = null;
      this._fadeTimer = 0;
      this._fps = 0;
      this._camState = 'idle';
      this._camErrorMsg = '';
      this._handlers = {};

      this._bindEvents();
      this._startFadeTimer();
    }

    mount(parent = document.body) {
      if (!parent.contains(this.root)) parent.appendChild(this.root);
    }
    unmount() {
      if (this._stopTracking) { this._stopTracking(); this._stopTracking = null; }
      if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
    }
    attachToVideo(videoEl) {
      this._videoEl = videoEl;
      this._applySavedPos();
      if (this._stopTracking) this._stopTracking();
      this._stopTracking = trackRect(videoEl, rect => this._anchorToVideo(rect));
    }
    setCollapsed(collapsed) {
      this._collapsed = collapsed;
      if (collapsed) {
        this.panel.classList.add('is-collapsed');
        this.chip.classList.add('is-visible');
      } else {
        this.panel.classList.remove('is-collapsed');
        this.chip.classList.remove('is-visible');
      }
    }
    setCameraState(state, extra = '') {
      this._camState = state;
      this._camErrorMsg = extra;
      this._refs.camRow.setAttribute('data-state', state);
      let text;
      switch (state) {
        case 'idle':    text = '摄像头：未启动'; break;
        case 'pending': text = '摄像头：请求权限…'; break;
        case 'running': text = `摄像头：已开启 · ${this._fps} fps`; break;
        case 'paused':  text = '摄像头：已暂停'; break;
        case 'error':   text = `摄像头：错误：${extra || '未知'}`; break;
        default:        text = '摄像头：未启动';
      }
      this._refs.camText.textContent = text;
      this._updateToggleLabel();
      this._noteInteraction();
    }
    setFps(fps) {
      this._fps = fps;
      if (this._camState === 'running') {
        this._refs.camText.textContent = `摄像头：已开启 · ${fps} fps`;
      }
    }
    setGesture(label) {
      this._refs.gestureText.textContent = `当前手势：${labelZh(label)}`;
      this._noteInteraction();
    }
    flashAction(actionKey) {
      const row = this._refs.actions[actionKey];
      if (!row) return;
      row.classList.add('is-firing');
      setTimeout(() => row.classList.remove('is-firing'), 240);
      this._noteInteraction();
    }
    setToggleLabel(label) {
      const btn = this.panel.querySelector('[data-btn="toggle"]');
      if (btn) btn.textContent = label;
    }
    // Show / hide the camera preview area and bind the MediaStream to the <video>.
    setCameraStream(stream) {
      const v = this.panel.querySelector('[data-preview]');
      if (!v) return;
      if (stream) {
        v.srcObject = stream;
        v.play().catch(() => {});
        this.panel.classList.add('has-stream');
      } else {
        v.srcObject = null;
        this.panel.classList.remove('has-stream');
      }
    }
    on(event, handler) {
      this._handlers[event] = handler;
      return this;
    }
    _emit(event, ...args) {
      const h = this._handlers[event];
      if (h) { try { h(...args); } catch (e) { console.error('[bg panel]', e); } }
    }

    _bindEvents() {
      this.panel.addEventListener('mouseenter', () => {
        this.panel.classList.add('is-active');
        this._noteInteraction();
      });
      this.panel.addEventListener('mouseleave', () => {
        if (!this._collapsed) this._scheduleFade();
      });
      this.root.addEventListener('click', e => {
        const target = e.target.closest('[data-btn]');
        if (!target) return;
        const btn = target.dataset.btn;
        if (btn === 'collapse') { this.setCollapsed(true); this._emit('collapse'); }
        else if (btn === 'expand') { this.setCollapsed(false); this._emit('expand'); this._noteInteraction(); }
        else if (btn === 'toggle') { this._emit('toggle'); this._noteInteraction(); }
      });
      const drag = this.panel.querySelector('[data-role="drag"]');
      drag.addEventListener('mousedown', e => this._beginDrag(e));
    }

    _beginDrag(e) {
      e.preventDefault();
      const rect = this.panel.getBoundingClientRect();
      this._dragState = {
        startX: e.clientX, startY: e.clientY,
        startTop: rect.top, startRight: window.innerWidth - rect.right,
      };
      this.panel.classList.add('is-active');
      const move = ev => {
        if (!this._dragState) return;
        const dy = ev.clientY - this._dragState.startY;
        const dx = ev.clientX - this._dragState.startX;
        const newTop = Math.max(0, this._dragState.startTop + dy);
        const newRight = Math.max(0, this._dragState.startRight - dx);
        this._customPos = { top: newTop, right: newRight };
        this._applyPos();
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        if (this._customPos) this._savePos();
        this._dragState = null;
        this._scheduleFade();
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    }

    _applyPos() {
      if (!this._customPos) return;
      this.panel.style.top = `${this._customPos.top}px`;
      this.panel.style.right = `${this._customPos.right}px`;
    }
    _applySavedPos() {
      try {
        const raw = localStorage.getItem(POS_STORAGE_KEY);
        if (!raw) return;
        const p = JSON.parse(raw);
        if (Number.isFinite(p.top) && Number.isFinite(p.right)) {
          this._customPos = p;
          this._applyPos();
        }
      } catch {}
    }
    _savePos() {
      try {
        if (this._customPos) localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(this._customPos));
      } catch {}
    }
    _anchorToVideo(rect) {
      if (this._customPos) return;
      if (rect.width < 50 || rect.height < 50) {
        this.panel.style.display = 'none';
        return;
      }
      this.panel.style.display = '';
      this.panel.style.top = `${Math.round(rect.top + OFFSET)}px`;
      this.panel.style.right = `${Math.round(window.innerWidth - rect.right + OFFSET)}px`;
    }
    _startFadeTimer() {
      if (this._fadeTimer) return;
      const tick = () => {
        this._fadeTimer = requestAnimationFrame(tick);
        const idleFor = performance.now() - this._lastInteraction;
        if (idleFor > FADE_AFTER_MS && !this._collapsed) {
          this.panel.classList.remove('is-active');
        }
      };
      tick();
    }
    _scheduleFade() {
      this._lastInteraction = performance.now() - FADE_AFTER_MS + 1500;
    }
    _noteInteraction() {
      this._lastInteraction = performance.now();
      this.panel.classList.add('is-active');
    }
    _updateToggleLabel() {
      let label;
      if (this._camState === 'running') label = '暂停识别';
      else if (this._camState === 'paused') label = '继续识别';
      else if (this._camState === 'pending') label = '请求中…';
      else if (this._camState === 'error') label = '重试开启';
      else label = '开启摄像头';
      this.setToggleLabel(label);
    }
  }

  BG.Panel = Panel;
})();
