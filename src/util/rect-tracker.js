// Track an element's bounding rect and invoke cb with normalized rect data.

window.BG = window.BG || {};
BG.trackRect = function trackRect(el, cb) {
  let raf = 0;
  const compute = () => {
    raf = 0;
    const r = el.getBoundingClientRect();
    cb({
      top: r.top, right: r.right, bottom: r.bottom, left: r.left,
      width: r.width, height: r.height,
    });
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(compute); };
  const ro = new ResizeObserver(schedule);
  ro.observe(el);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  schedule();
  return () => {
    ro.disconnect();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (raf) cancelAnimationFrame(raf);
  };
};
