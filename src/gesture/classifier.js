// Gesture state machine: per-frame labels → hold/start/move events with debouncing.
// - open_palm (held) fires once → play/pause
// - fist tracks horizontal + vertical wrist motion → scrub progress / adjust volume

window.BG = window.BG || {};
(() => {
  const { TH } = BG;

  class GestureClassifier {
    constructor() {
      this._listeners = {};
      this._state = 'idle';
      this._candidate = 'none';
      this._holdStart = 0;
      this._lastFire = 0;
      this._fistAnchorX = null;
      this._fistAnchorY = null;
      this._fistAnchorTime = null;
      this._fistAnchorVolume = null;
      this._currentLabel = 'none';
    }
    on(event, cb) {
      (this._listeners[event] ||= []).push(cb);
      return this;
    }
    _emit(event, ...args) {
      this._listeners[event]?.forEach(cb => { try { cb(...args); } catch (e) { console.error('[bg]', e); } });
    }
    get currentLabel() { return this._currentLabel; }

    feed(label, meta = {}) {
      this._currentLabel = label;
      this._emit('label', label);

      if (label === this._candidate && this._state === 'holding') {
        this._advanceHolding(label, meta);
        return;
      }
      if (label !== this._candidate) {
        this._candidate = label;
        this._state = 'holding';
        this._holdStart = performance.now();
        if (label === 'fist') {
          this._fistAnchorX = meta.x ?? null;
          this._fistAnchorY = meta.y ?? null;
          this._fistAnchorTime = meta.currentTime ?? null;
          this._fistAnchorVolume = meta.volume ?? null;
        } else {
          this._fistAnchorX = null;
          this._fistAnchorY = null;
          this._fistAnchorTime = null;
          this._fistAnchorVolume = null;
        }
      }
    }

    _advanceHolding(label, meta) {
      const now = performance.now();
      const heldFor = now - this._holdStart;

      if (label === 'open_palm' && heldFor >= TH.PALM_HOLD_MS) {
        if (this._state !== 'fired' && (now - this._lastFire) >= TH.ACTION_DEBOUNCE_MS) {
          this._state = 'fired';
          this._lastFire = now;
          this._emit('open_palm:hold', meta);
          this._emit('hold', { label, meta });
        }
        return;
      }

      if (label === 'fist') {
        const x = meta.x, y = meta.y;
        if (x == null || y == null) return;
        if (this._fistAnchorX == null) {
          this._fistAnchorX = x;
          this._fistAnchorY = y;
          this._fistAnchorTime = meta.currentTime ?? null;
          this._fistAnchorVolume = meta.volume ?? null;
          this._emit('fist:start', { x, y, currentTime: this._fistAnchorTime, volume: this._fistAnchorVolume });
          return;
        }
        const dxNorm = x - this._fistAnchorX;
        const dyNorm = y - this._fistAnchorY;
        if (Math.abs(dxNorm) >= TH.SCRUB_MIN_DISPLACEMENT_NORM ||
            Math.abs(dyNorm) >= TH.SCRUB_MIN_DISPLACEMENT_NORM) {
          this._emit('fist:move', { x, y, dxNorm, dyNorm, currentTime: this._fistAnchorTime, volume: this._fistAnchorVolume });
        }
        return;
      }
    }

    notifyLost() {
      this._currentLabel = 'none';
      this._emit('label', 'none');
      if (this._fistAnchorX != null) {
        this._emit('fist:end', {});
        this._fistAnchorX = null;
        this._fistAnchorY = null;
        this._fistAnchorTime = null;
        this._fistAnchorVolume = null;
      }
      this._candidate = 'none';
      this._state = 'idle';
      this._holdStart = 0;
    }
  }

  BG.GestureClassifier = GestureClassifier;
})();
