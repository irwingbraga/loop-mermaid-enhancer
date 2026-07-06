/* export-button.js — floating "Export as Markdown" toolbar for the whole page.
 *
 * Copy button      → md to clipboard as text/plain (works everywhere).
 * Download button  → .md file named after the page's <title>.
 * Cmd/Ctrl+Shift+M → same as Copy (fast keyboard workflow).
 *
 * We wait for a page root to exist before mounting (Loop hydrates async on
 * navigation). Because Loop is a SPA, we also re-check on URL changes so the
 * button remounts when the user opens a new page.
 */
(() => {
  const HOST_ID = 'lme-md-export-host';
  const HOTKEY = (e) => (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm';

  function makeUi() {
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.innerHTML = `
      <button class="lme-md-btn" data-act="copy"     title="Copy page as Markdown (⌘⇧M)">📋 Copy .md</button>
      <button class="lme-md-btn" data-act="download" title="Download page as .md file">⬇ .md</button>
    `;
    host.addEventListener('click', onAction);
    return host;
  }

  async function onAction(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    e.stopPropagation();
    try {
      const md = renderMarkdown();
      if (!md) { flash(btn, '∅', 'No content'); return; }
      if (btn.dataset.act === 'copy') {
        await navigator.clipboard.writeText(md);
        flash(btn, '✓', 'Copied');
      } else {
        downloadFile(md, pageFilename());
        flash(btn, '✓', 'Downloaded');
      }
    } catch (err) {
      console.error('[LME] export failed:', err);
      flash(btn, '!', 'Failed — see console');
    }
  }

  function renderMarkdown() {
    const root = window.__LME_export_md.findPageRoot();
    if (!root) return '';
    const title = pageTitleFromDom();
    const body = window.__LME_export_md.pageToMarkdown(root);
    return title ? `# ${title}\n\n${body}` : body;
  }

  function pageTitleFromDom() {
    // Loop puts the page title in a heading (aria-level=1) near the top.
    // Fall back to document.title stripped of the " | Microsoft Loop" suffix.
    const h1 = document.querySelector('[role="heading"][aria-level="1"]');
    if (h1?.textContent?.trim()) return h1.textContent.trim();
    return (document.title || '').replace(/\s*[\|\-—]\s*Microsoft Loop\s*$/i, '').trim();
  }

  function pageFilename() {
    const title = pageTitleFromDom() || 'loop-page';
    const safe = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    return `${safe}.md`;
  }

  function downloadFile(text, filename) {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function flash(btn, mark, label) {
    const prev = btn.textContent;
    btn.textContent = `${mark} ${label}`;
    btn.classList.add('lme-md-btn--flash');
    setTimeout(() => { btn.textContent = prev; btn.classList.remove('lme-md-btn--flash'); }, 1200);
  }

  function ensureMounted() {
    if (document.getElementById(HOST_ID)) return;
    if (!window.__LME_export_md?.findPageRoot()) return; // page not hydrated yet
    document.body.appendChild(makeUi());
  }

  // Watch for hydration + SPA navigation.
  const obs = new MutationObserver(() => ensureMounted());
  obs.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('load', ensureMounted, { once: true });
  setTimeout(ensureMounted, 800);
  setTimeout(ensureMounted, 2500);

  // Keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if (!HOTKEY(e)) return;
    // Ignore when typing in Loop's own inputs (rare, but safe).
    if (e.target.matches?.('input, textarea')) return;
    e.preventDefault();
    const btn = document.querySelector('#' + HOST_ID + ' [data-act="copy"]');
    btn?.click();
  }, true);
})();
