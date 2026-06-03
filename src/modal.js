/* modal.js — fullscreen viewer with svg-pan-zoom on a cloned SVG.
 *
 * Why clone the SVG? Loop's preview iframe is sized to a fixed pane and clipped.
 * Mounting svg-pan-zoom directly on Loop's SVG would mutate the iframe's DOM (it
 * adds viewport <g>s and overrides the viewBox). Working on a clone keeps Loop
 * untouched and lets us close cleanly.
 */
(() => {
  let openModal = null; // { root, cleanup }

  function close() {
    if (!openModal) return;
    openModal.cleanup?.();
    openModal.root.remove();
    openModal = null;
    document.removeEventListener('keydown', onKey, true);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  }

  function open(sourceSvg, { theme = 'light' } = {}) {
    if (openModal) close();
    if (!sourceSvg) return;

    const root = document.createElement('div');
    root.className = `lme-modal lme-theme-${theme}`;
    root.innerHTML = `
      <div class="lme-modal__backdrop" data-lme-close></div>
      <div class="lme-modal__shell" role="dialog" aria-label="Mermaid diagram fullscreen">
        <header class="lme-modal__bar">
          <span class="lme-modal__title">Mermaid diagram</span>
          <div class="lme-modal__spacer"></div>
          <button class="lme-btn" data-act="zoom-in"  title="Zoom in (= / +)">＋</button>
          <button class="lme-btn" data-act="zoom-out" title="Zoom out (-)">−</button>
          <button class="lme-btn" data-act="fit"      title="Fit to viewport (0)">⤢</button>
          <button class="lme-btn" data-act="reset"    title="Reset (R)">⟲</button>
          <span class="lme-modal__div"></span>
          <button class="lme-btn" data-act="copy-svg" title="Copy SVG markup">Copy SVG</button>
          <button class="lme-btn" data-act="copy-png" title="Copy PNG to clipboard">Copy PNG</button>
          <button class="lme-btn" data-act="dl-svg"   title="Download .svg">↓ SVG</button>
          <button class="lme-btn" data-act="dl-png"   title="Download .png (2×)">↓ PNG</button>
          <span class="lme-modal__div"></span>
          <button class="lme-btn lme-btn--ghost" data-act="close" title="Close (Esc)">✕</button>
        </header>
        <div class="lme-modal__stage"></div>
      </div>`;
    document.body.appendChild(root);

    const stage = root.querySelector('.lme-modal__stage');
    const svg = sourceSvg.cloneNode(true);
    // Mermaid SVG often has width="100%" + max-width — strip so svg-pan-zoom can size it.
    svg.removeAttribute('style');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    stage.appendChild(svg);

    const spz = window.svgPanZoom(svg, {
      zoomEnabled: true,
      panEnabled: true,
      controlIconsEnabled: false,
      fit: true,
      center: true,
      minZoom: 0.2,
      maxZoom: 20,
      zoomScaleSensitivity: 0.35,
    });

    function actions(act) {
      switch (act) {
        case 'zoom-in':  spz.zoomIn(); break;
        case 'zoom-out': spz.zoomOut(); break;
        case 'fit':      spz.fit(); spz.center(); break;
        case 'reset':    spz.resetZoom(); spz.center(); break;
        case 'copy-svg': window.__LME_export.copySvg(sourceSvg).catch(console.error); break;
        case 'copy-png': window.__LME_export.copyPng(sourceSvg).catch(console.error); break;
        case 'dl-svg':   window.__LME_export.downloadSvg(sourceSvg); break;
        case 'dl-png':   window.__LME_export.downloadPng(sourceSvg); break;
        case 'close':    close(); break;
      }
    }

    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act], [data-lme-close]');
      if (!t) return;
      if (t.dataset.lmeClose !== undefined) return close();
      actions(t.dataset.act);
    });

    function onKeyShortcut(e) {
      if (e.target.matches('input, textarea, [contenteditable="true"]')) return;
      if (e.key === '+' || e.key === '=') { spz.zoomIn(); e.preventDefault(); }
      else if (e.key === '-' || e.key === '_') { spz.zoomOut(); e.preventDefault(); }
      else if (e.key === '0') { spz.fit(); spz.center(); e.preventDefault(); }
      else if (e.key === 'r' || e.key === 'R') { spz.resetZoom(); spz.center(); e.preventDefault(); }
    }
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('keydown', onKeyShortcut);

    openModal = {
      root,
      cleanup: () => { try { spz.destroy(); } catch (_) {} },
    };
  }

  window.__LME_modal = { open, close };
})();
