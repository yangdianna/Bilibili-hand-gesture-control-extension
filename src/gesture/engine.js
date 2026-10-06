// MediaPipe Hands wrapper — runs in MAIN world (injected by content.js).
// Simplest, non-blocking approach: locateFile returns chrome-extension:// URLs for
// everything. MediaPipe fetches .wasm/.data asynchronously (no main-thread blocking,
// no base64). If bilibili's connect-src blocks those fetches, we'll see a clear
// "Failed to fetch" error instead of a page freeze.

window.BG = window.BG || {};
(() => {
  class GestureEngine {
    constructor() {
      this._hands = null;
      this._busy = false;
      this._lastResults = null;
      this._onResults = null;
      this._sentOnce = false;
    }

    async init({ onResults }) {
      this._onResults = onResults;
      if (typeof window.Hands !== 'function') {
        throw new Error('window.Hands not found — hands.js must be injected into MAIN world before engine.js');
      }

      const base = (document.documentElement.dataset.bgBase || '') + 'src/vendor/';
      const hands = new window.Hands({ locateFile: (file) => base + file });
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5,
        selfieMode: true,
      });
      hands.onResults((results) => {
        this._lastResults = results;
        if (this._onResults) this._onResults(results);
      });
      this._hands = hands;
      console.log('[bg] engine init done — Hands instance created (chrome-extension:// locateFile)');
    }

    async send(videoEl) {
      if (!this._hands || this._busy) return;
      this._busy = true;
      try {
        await this._hands.send({ image: videoEl });
        if (!this._sentOnce) {
          this._sentOnce = true;
          console.log('[bg] hands.send resolved (first frame processed)');
        }
      }
      catch (e) { console.error('[bg] mediapipe send error:', e); }
      finally { this._busy = false; }
    }

    get lastResults() { return this._lastResults; }

    dispose() {
      try { this._hands?.close(); } catch {}
      this._hands = null;
      this._lastResults = null;
    }
  }

  BG.GestureEngine = GestureEngine;
})();
