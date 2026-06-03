/* content.js — orchestrator. Watches the page, attaches/detaches enhancements
 * per Mermaid code block. Loop mounts/unmounts blocks aggressively as you scroll
 * (virtualized), so we react to mutations rather than scanning once.
 */
(() => {
  const D = window.__LME_detect;
  const TB = window.__LME_toolbar;
  const SXS = window.__LME_sxs;

  function scan(root = document) {
    for (const block of D.findAllMermaidBlocks(root)) {
      TB.attach(block);
      SXS.attach(block);
    }
  }

  // Debounced mutation handler — Loop generates a lot of mutations during typing.
  let pending = false;
  function schedule(mut) {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      // Cheap: re-scan from document. The attach functions are idempotent.
      scan(document);
    });
  }

  // We watch attribute changes too because Loop's "Display options" menu
  // toggles panes via `style="display:none"` on existing nodes (not by
  // mounting/unmounting). Without this, our re-scan would only fire on the
  // next unrelated mutation — which felt like a lag when flipping display
  // modes. The rAF debounce keeps the per-keystroke storm cheap.
  const obs = new MutationObserver(schedule);
  obs.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden'],
  });

  // Initial pass once Loop's app has likely hydrated.
  if (document.readyState === 'complete') scan();
  else window.addEventListener('load', () => scan(), { once: true });

  // Also re-scan a couple of times shortly after load for late-mounting blocks.
  setTimeout(scan, 1500);
  setTimeout(scan, 4000);

  // Theme propagation — keep our class on body in sync so modal/toolbar restyle live.
  window.__LME_theme.onThemeChange((theme) => {
    document.body.classList.toggle('lme-theme-dark', theme === 'dark');
    document.body.classList.toggle('lme-theme-light', theme === 'light');
  });

  // Expose a tiny debug surface (handy in DevTools console).
  window.__LME = { scan, detect: D, toolbar: TB, sxs: SXS };
})();
