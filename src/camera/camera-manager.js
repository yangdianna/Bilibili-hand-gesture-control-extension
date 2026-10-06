// Camera lifecycle: getUserMedia, FPS counter, error localization.

window.BG = window.BG || {};
(() => {
  const ERROR_MSG_ZH = {
    NotAllowedError: '权限被拒绝（请在浏览器设置中允许摄像头）',
    NotFoundError: '未找到摄像头设备',
    NotReadableError: '摄像头被其他程序占用',
    OverconstrainedError: '摄像头参数不支持',
    AbortError: '摄像头启动被中断',
    SecurityError: '安全限制（需要 HTTPS 或 localhost）',
  };

  class CameraManager {
    constructor() {
      this._listeners = {};
      this._stream = null;
      this._track = null;
      this._fpsRaf = 0;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
      this._lastFpsT = 0;
      this._fps = 0;
      this._state = 'idle';
      this._videoEl = null;
    }
    on(event, cb) {
      (this._listeners[event] ||= []).push(cb);
      return this;
    }
    _emit(event, ...args) {
      this._listeners[event]?.forEach(cb => { try { cb(...args); } catch (e) { console.error('[bg]', e); } });
    }
    get state() { return this._state; }
    get fps() { return this._fps; }
    async start() {
      if (this._state === 'running' || this._state === 'pending') return;
      this._setState('pending');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
        this._stream = stream;
        this._track = stream.getVideoTracks()[0];
        if (!this._track) throw new DOMException('No video track', 'NotFoundError');
        this._videoEl = document.createElement('video');
        this._videoEl.srcObject = stream;
        this._videoEl.autoplay = true;
        this._videoEl.muted = true;
        this._videoEl.playsInline = true;
        await this._videoEl.play().catch(() => {});
        this._setState('running');
        this._startFps();
        this._emit('started', this._videoEl);
      } catch (err) {
        const name = err?.name || 'Error';
        const msg = ERROR_MSG_ZH[name] || err?.message || '未知错误';
        this._setState('error', msg);
        this._emit('error', { name, message: msg });
        throw err;
      }
    }
    pause() {
      if (this._state !== 'running') return;
      this._stopFps();
      if (this._track) this._track.enabled = false;
      this._setState('paused');
      this._emit('paused');
    }
    resume() {
      if (this._state !== 'paused') return;
      if (this._track) this._track.enabled = true;
      this._setState('running');
      this._startFps();
      this._emit('resumed');
    }
    stop() {
      this._stopFps();
      if (this._stream) {
        this._stream.getTracks().forEach(t => t.stop());
        this._stream = null;
      }
      this._track = null;
      if (this._videoEl) {
        this._videoEl.srcObject = null;
        this._videoEl = null;
      }
      this._setState('idle');
      this._emit('stopped');
    }
    getSourceElement() { return this._videoEl; }
    getStream() { return this._stream; }
    _setState(state, errMsg = '') {
      this._state = state;
      this._emit('state', { state, errMsg });
    }
    _startFps() {
      this._lastFpsT = performance.now();
      this._fpsAccum = 0;
      this._fpsFrames = 0;
      const tick = () => {
        this._fpsRaf = requestAnimationFrame(tick);
        if (!this._videoEl) return;
        const now = performance.now();
        const dt = now - this._lastFpsT;
        this._fpsAccum += dt;
        this._fpsFrames += 1;
        if (this._fpsAccum >= 1000) {
          this._fps = Math.round((this._fpsFrames * 1000) / this._fpsAccum);
          this._emit('fps', this._fps);
          this._fpsAccum = 0;
          this._fpsFrames = 0;
          this._lastFpsT = now;
        }
      };
      this._fpsRaf = requestAnimationFrame(tick);
    }
    _stopFps() {
      if (this._fpsRaf) cancelAnimationFrame(this._fpsRaf);
      this._fpsRaf = 0;
      this._fps = 0;
      this._emit('fps', 0);
    }
  }

  BG.CameraManager = CameraManager;
})();
