// DOM utility helpers. All run inside the bilibili.com page context.
// Attaches to window.BG (classic-script style; concatenated and injected by main.py).

window.BG = window.BG || {};
BG.dom = (() => {
  function waitForSelector(selector, { timeout = 15000, root = document } = {}) {
    return new Promise((resolve, reject) => {
      const found = root.querySelector(selector);
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const el = root.querySelector(selector);
        if (el) { obs.disconnect(); resolve(el); }
      });
      obs.observe(root.documentElement || root, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error(`waitForSelector timeout: ${selector}`)); }, timeout);
    });
  }

  function injectStyle(css) {
    const s = document.createElement('style');
    s.setAttribute('data-bg-style', '1');
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
    return s;
  }

  function elFromHtml(html) {
    const t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  }

  return { waitForSelector, injectStyle, elFromHtml };
})();
