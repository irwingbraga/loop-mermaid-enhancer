/* detect.js — locating Mermaid code blocks inside Loop's DOM.
 *
 * Loop's editor is a custom react thing ("scriptor"). Stable hooks we rely on:
 *   - div.scriptor-component-code-block            — outer block (any language)
 *   - #language-selector[value="Mermaid"]          — identifies it as mermaid
 *   - [aria-label*="Mermaid generated"]  (role was "region", now "graphics-document document"; do not rely on role)
 *                                                  — the preview pane region
 *   - div.unsafe-content                           — the transform wrapper Loop pans/zooms
 *   - iframe[id^="codePreviewIframe"]              — same-origin srcdoc iframe with the SVG
 *   - [aria-label="Editor container"] / [aria-label="Code editor"]
 *                                                  — the source-side editor
 *
 * We MUST NOT depend on Griffel atomic class hashes (___xxx / fxxx) — those change
 * every Loop release.
 */
(() => {
  const SEL = {
    codeBlock: 'div.scriptor-component-code-block',
    languageSelector: '#language-selector',
    previewPane: '[aria-label*="Mermaid generated"]',
    unsafeContent: 'div.unsafe-content',
    iframe: 'iframe[id^="codePreviewIframe"]',
    editorContainer: '[aria-label="Editor container"]',
    codeEditor: '[aria-label="Code editor"]',
  };

  function isMermaidBlock(block) {
    // Primary signal: the language-selector button in the block's top toolbar.
    // Reliable in edit / side-by-side / code-only modes.
    const sel = block.querySelector(SEL.languageSelector);
    if (sel) {
      const v = (sel.getAttribute('value') || sel.textContent || '').trim().toLowerCase();
      if (v === 'mermaid') return true;
    }
    // Fallback: in "Preview only" display mode Loop hides the top toolbar (so
    // #language-selector is gone), but the preview pane keeps its aria-label
    // of the form "<diagram-type> - Mermaid generated from code, ...". That
    // phrase is stable and only used for mermaid blocks.
    return !!block.querySelector(SEL.previewPane);
  }

  function findAllMermaidBlocks(root = document) {
    return Array.from(root.querySelectorAll(SEL.codeBlock)).filter(isMermaidBlock);
  }

  /** Walk into the same-origin srcdoc iframe and return the rendered <svg>, if ready. */
  function readPreviewSvg(block) {
    const iframe = block.querySelector(SEL.iframe);
    if (!iframe) return null;
    let doc = null;
    try { doc = iframe.contentDocument; } catch (_) { /* cross-origin (shouldn't happen for srcdoc) */ }
    if (!doc) return null;
    return doc.querySelector('svg[id^="mermaid-"]') || doc.querySelector('svg');
  }

  /** The element Loop applies its pan/zoom transform to. We re-use it for our own modal. */
  function findTransformWrapper(block) {
    const pane = block.querySelector(SEL.previewPane);
    return pane ? pane.querySelector(SEL.unsafeContent) : null;
  }

  /** Find the flex parent that holds editor & preview as siblings — its flex-direction is what we toggle. */
  function findSxsParent(block) {
    const editor = block.querySelector(SEL.editorContainer);
    const preview = block.querySelector(SEL.previewPane);
    if (!editor || !preview) return null;
    // Walk up from editor until we hit an ancestor that also contains preview.
    let node = editor.parentElement;
    while (node && !node.contains(preview)) node = node.parentElement;
    return node || null;
  }

  window.__LME_detect = {
    SEL,
    isMermaidBlock,
    findAllMermaidBlocks,
    readPreviewSvg,
    findTransformWrapper,
    findSxsParent,
  };
})();
