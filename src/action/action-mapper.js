// Bind classifier events to <video> element actions.
//   open_palm (held)  → toggle play/pause
//   fist horizontal  → scrub progress
//   fist vertical    → adjust volume

window.BG = window.BG || {};
(() => {
  const { TH } = BG;

  function bindActions(videoEl, classifier, panel) {
    classifier.on('open_palm:hold', () => {
      if (videoEl.paused) videoEl.play().catch(() => {});
      else videoEl.pause();
      panel?.flashAction('play');
    });

    classifier.on('fist:start', () => panel?.flashAction('scrub'));

    classifier.on('fist:move', ({ dxNorm, dyNorm }) => {
      const horizontal = Math.abs(dxNorm) >= Math.abs(dyNorm);
      if (horizontal) {
        // Scrub progress
        if (classifier._fistAnchorTime == null) return;
        const widthPx = window.innerWidth;
        const dxPx = dxNorm * widthPx;
        const newTime = classifier._fistAnchorTime + dxPx * TH.SCRUB_PIXEL_TO_SECONDS;
        videoEl.currentTime = Math.max(0, Math.min(videoEl.duration || 0, newTime));
        panel?.flashAction('scrub');
      } else {
        // Adjust volume (moving up → increase, y increases downward)
        if (classifier._fistAnchorVolume == null) return;
        const newVol = classifier._fistAnchorVolume - dyNorm * TH.VOLUME_SENSITIVITY;
        videoEl.volume = Math.max(0, Math.min(1, newVol));
        panel?.flashAction('volume');
      }
    });
  }

  BG.bindActions = bindActions;
})();
