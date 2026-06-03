/* toolbar.js — injects an LME toolbar into each Mermaid preview pane.
 *
 * Idempotency rule: we check for the toolbar *element* itself, not a marker
 * attribute. Loop's expand/collapse re-mounts the preview subtree, which used
 * to leave a stale `data-lme-enhanced` flag on a detached pane while the new
 * (visible) pane never got a toolbar. Element check fixes that automatically.
 *
 * Visibility: always shown (no opacity-on-hover) so the user never wonders if
 * the extension is alive. Loop's own pan/zoom controls already overlap with the
 * bottom of the pane, so we live in the top-right where there's nothing.
 */
(() => {
  function makeToolbar() {
    const el = document.createElement('div');
    el.className = 'lme-toolbar';
    el.innerHTML = `
      <button class="lme-tb-btn" data-act="fullscreen" title="Fullscreen (open large viewer)">⛶</button>
      <button class="lme-tb-btn" data-act="copy-svg"   title="Copy SVG markup">{ }</button>
      <button class="lme-tb-btn" data-act="copy-png"   title="Copy PNG to clipboard">📋</button>
      <button class="lme-tb-btn" data-act="dl-png"     title="Download PNG (2×)">↓</button>
    `;
    return el;
  }

  function attach(block) {
    const pane = block.querySelector(window.__LME_detect.SEL.previewPane);
    if (!pane) return;
    // Idempotency: bail only if the toolbar element is actually present.
    if (pane.querySelector(':scope > .lme-toolbar')) return;

    // Pane uses overflow:hidden; need a positioned host so abs-positioned tb is visible.
    // Use setProperty so Griffel's `!important` can't override us.
    if (getComputedStyle(pane).position === 'static') {
      pane.style.setProperty('position', 'relative', 'important');
    }

    const tb = makeToolbar();
    pane.appendChild(tb);

    tb.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      // Loop's pan/zoom swallows pointerdown inside .unsafe-content; toolbar lives
      // outside that wrapper so clicks reach us, but stop propagation defensively.
      e.stopPropagation();
      const svg = window.__LME_detect.readPreviewSvg(block);
      if (!svg) { flash(btn, '!'); return; }
      try {
        switch (btn.dataset.act) {
          case 'fullscreen':
            window.__LME_modal.open(svg, { theme: window.__LME_theme.currentTheme() });
            break;
          case 'copy-svg': await window.__LME_export.copySvg(svg); flash(btn, '✓'); break;
          case 'copy-png': await window.__LME_export.copyPng(svg); flash(btn, '✓'); break;
          case 'dl-png':   await window.__LME_export.downloadPng(svg); flash(btn, '✓'); break;
        }
      } catch (err) {
        console.error('[LME] toolbar action failed:', err);
        flash(btn, '!');
      }
    });
  }

  function flash(btn, mark) {
    const prev = btn.textContent;
    btn.textContent = mark;
    btn.classList.add('lme-tb-btn--flash');
    setTimeout(() => { btn.textContent = prev; btn.classList.remove('lme-tb-btn--flash'); }, 900);
  }

  function detach(block) {
    const pane = block.querySelector(window.__LME_detect.SEL.previewPane);
    pane?.querySelector(':scope > .lme-toolbar')?.remove();
  }

  window.__LME_toolbar = { attach, detach };
})();
