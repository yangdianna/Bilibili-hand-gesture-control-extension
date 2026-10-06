// MediaPipe Hands landmark indices, thresholds, and gesture classification helpers.
// Coordinates are normalized 0..1, with y increasing downward (image space).
// x is mirrored when selfieMode is enabled.

window.BG = window.BG || {};
(() => {
  const LM = {
    WRIST: 0,
    THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
    INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
    MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
    RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
    PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
  };

  const TH = {
    FINGER_EXTEND_MARGIN: 0.05,          // 手指伸直阈值（y 坐标法，越小越宽松）
    PALM_SPREAD_THRESHOLD: 0.3,          // 手指张开度阈值：相邻指尖距离之和，越大越严格
    PALM_HOLD_MS: 400,                   // open palm must be held this long to fire play/pause
    ACTION_DEBOUNCE_MS: 1200,            // same action won't refire within this window
    SCRUB_MIN_DISPLACEMENT_NORM: 0.03,   // min normalized fist displacement before scrubbing/volume
    SCRUB_PIXEL_TO_SECONDS: 0.05,        // each pixel of horizontal fist motion = 50ms
    VOLUME_SENSITIVITY: 0.6,             // volume change per normalized full-screen-height motion
  };

  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // y 坐标法：手指伸直时指尖在图像中位于指节上方（y 更小）。拳头检测用这个，很稳。
  function isFingerExtended(lm, finger) {
    const pair = {
      index: [LM.INDEX_TIP, LM.INDEX_PIP],
      middle: [LM.MIDDLE_TIP, LM.MIDDLE_PIP],
      ring: [LM.RING_TIP, LM.RING_PIP],
      pinky: [LM.PINKY_TIP, LM.PINKY_PIP],
    }[finger];
    return lm[pair[0]].y < lm[pair[1]].y - TH.FINGER_EXTEND_MARGIN;
  }

  // 手指张开度：相邻指尖距离之和（thumb-index + index-middle + middle-ring + ring-pinky）。
  // 手掌张开时这个值大，握拳时小。跟手掌朝向无关，比 y 坐标法更适合判手掌。
  function fingerSpread(lm) {
    const tips = [LM.THUMB_TIP, LM.INDEX_TIP, LM.MIDDLE_TIP, LM.RING_TIP, LM.PINKY_TIP];
    let sum = 0;
    for (let i = 0; i < tips.length - 1; i++) sum += dist(lm[tips[i]], lm[tips[i + 1]]);
    return sum;
  }

  const LABEL_ZH = { none: '—', open_palm: '🖐️ 手掌', fist: '✊ 握拳' };

  function classify(lm) {
    if (!lm || lm.length < 21) return 'none';

    const extended = ['index', 'middle', 'ring', 'pinky']
      .filter(f => isFingerExtended(lm, f)).length;
    const spread = fingerSpread(lm);

    // open_palm: 手指张开（张开度大），不依赖朝向
    if (spread > TH.PALM_SPREAD_THRESHOLD) return 'open_palm';
    // fist: 没有手指伸直
    if (extended === 0) return 'fist';
    return 'none';
  }

  function labelZh(label) { return LABEL_ZH[label] ?? '—'; }

  function wristX(lm) { return lm ? lm[LM.WRIST].x : null; }
  function wristY(lm) { return lm ? lm[LM.WRIST].y : null; }

  BG.LM = LM;
  BG.TH = TH;
  BG.classify = classify;
  BG.labelZh = labelZh;
  BG.wristX = wristX;
  BG.wristY = wristY;
  BG.fingerSpread = fingerSpread; // 供调试：可临时 log 出张开度数值
})();
