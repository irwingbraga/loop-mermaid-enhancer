/* sxs-toggle.js — flips the editor/preview split between vertical (Loop's default,
 * editor on top / preview on bottom) and horizontal (side by side).
 *
 * Implementation notes:
 *   - We detect orientation from computed style, not assumption — the DOM samples
 *     show Loop's default is actually `flex-direction: column` with children
 *     sized via inline `height: 50%`. Earlier we assumed `row`; that's why the
 *     first click was a no-op.
 *   - Loop sets flex-direction via Griffel atomic classes that use `!important`.
 *     We win by writing inline styles with `setProperty(..., 'important')` rather
 *     than relying on a CSS class — same trick is needed for the children's
 *     width/height swap.
 *   - We re-query the parent at click time. Loop's React reconciler can swap the
 *     subtree out from under us when toggling edit/view mode or expand/collapse,
 *     and a stale closure reference would just no-op silently.
 */
(() => {
  const ATTR = 'data-lme-sxs';
  // Inline-style stash so we can restore on detach without remembering values.
  const STASH = 'data-lme-sxs-stash';

  function isVisible(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /** The toggle only makes sense when BOTH editor and preview are actually
   * visible. Loop keeps the hidden pane in the DOM (`display: none`) when the
   * user picks "Code only" or "Preview only", so a plain `querySelector` check
   * isn't enough. */
  function isEditing(block) {
    const ed = block.querySelector(window.__LME_detect.SEL.editorContainer);
    const pv = block.querySelector(window.__LME_detect.SEL.previewPane);
    return isVisible(ed) && isVisible(pv);
  }

  function currentMode(parent) {
    const fd = getComputedStyle(parent).flexDirection;
    return fd.startsWith('row') ? 'h' : 'v';
  }

  function attach(block) {
    const existing = block.querySelector(':scope .lme-sxs-btn');
    const parent = window.__LME_detect.findSxsParent(block);
    const canSplit = isEditing(block) && !!parent;

    // Display mode flipped to a single-pane view: remove the now-irrelevant
    // button AND restore Loop's natural layout so a later return to
    // side-by-side mode starts clean instead of inheriting our forced row.
    if (!canSplit) {
      if (existing) detach(block);
      return;
    }
    if (existing) return;

    block.setAttribute(ATTR, currentMode(parent));

    const btn = document.createElement('button');
    btn.className = 'lme-sxs-btn';
    btn.type = 'button';
    btn.title = 'Toggle editor/preview split (vertical ↔ horizontal)';
    btn.textContent = block.getAttribute(ATTR) === 'h' ? '⇅ Stack' : '⇆ Side-by-side';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Re-resolve parent in case Loop re-rendered since attach-time.
      const p = window.__LME_detect.findSxsParent(block);
      if (!p) return;
      const next = (block.getAttribute(ATTR) || currentMode(p)) === 'h' ? 'v' : 'h';
      apply(p, next);
      block.setAttribute(ATTR, next);
      btn.textContent = next === 'h' ? '⇅ Stack' : '⇆ Side-by-side';
    });

    // Mount inside the code block's top toolbar (the row that hosts go-to-line etc.).
    const host = block.querySelector('[data-overflow-item]')?.parentElement || block;
    host.appendChild(btn);
  }

  function isDivider(c) {
    return c.getAttribute?.('role') === 'separator' || c.classList?.contains('fui-Divider');
  }
  function isOurNode(c) { return c.classList?.contains('lme-sxs-btn'); }

  function paneChildren(parent) {
    return Array.from(parent.children).filter((c) => !isOurNode(c) && !isDivider(c));
  }
  function dividerChildren(parent) {
    return Array.from(parent.children).filter(isDivider);
  }

  /** Force horizontal/vertical with inline styles strong enough to beat Griffel.
   *
   * Pane sizing uses `flex: 1 1 0; min-width: 0` instead of `width: 50% +
   * flex-basis: 0` — the latter is contradictory (basis wins, width is dead
   * code) AND flex items default to `min-width: auto` (= intrinsic content
   * width), which can refuse to shrink for wide editors.
   *
   * The divider gets `flex: 0 0 auto` in row mode. Fluent's vertical divider
   * default is `flex: 1 1 auto`; without this pin it grows to fill the row,
   * leaving 0 space for our panes — that's the "both panes disappeared" bug.
   */
  function apply(parent, mode) {
    if (mode === 'h') {
      stash(parent);
      parent.style.setProperty('flex-direction', 'row', 'important');

      // V1's pane sizing — confirmed to render correctly when applied uniformly.
      // We keep width:50% even though flex-basis:0 will override it for the
      // initial main-size; the redundancy is harmless and makes the intent
      // obvious if Loop ever changes flex defaults.
      for (const child of paneChildren(parent)) {
        stash(child);
        child.style.setProperty('width', '50%', 'important');
        child.style.setProperty('height', 'auto', 'important');
        child.style.setProperty('min-height', '300px', 'important');
        child.style.setProperty('flex-grow', '1', 'important');
        child.style.setProperty('flex-basis', '0', 'important');
      }

      // The divider — in v1 it got the same styles as the panes and was visible
      // as a 33% empty block (the "strange gap"). Skipping it left Fluent's
      // vertical-divider defaults to expand and consume the row, hiding both
      // panes. Hide it outright: in row mode the editor/preview don't need a
      // visual separator (the border on each pane / Loop's own backgrounds
      // already disambiguate them).
      for (const d of dividerChildren(parent)) {
        stash(d);
        d.style.setProperty('display', 'none', 'important');
      }
    } else {
      restore(parent);
      for (const child of paneChildren(parent)) restore(child);
      for (const d of dividerChildren(parent)) restore(d);
    }
  }

  /** Save the current inline `style` attribute exactly once, so restore is faithful. */
  function stash(el) {
    if (el.hasAttribute(STASH)) return;
    el.setAttribute(STASH, el.getAttribute('style') || '');
  }

  function restore(el) {
    if (!el.hasAttribute(STASH)) return;
    const orig = el.getAttribute(STASH);
    if (orig) el.setAttribute('style', orig); else el.removeAttribute('style');
    el.removeAttribute(STASH);
  }

  function detach(block) {
    block.removeAttribute(ATTR);
    block.querySelector(':scope .lme-sxs-btn')?.remove();
    const parent = window.__LME_detect.findSxsParent(block);
    if (parent) {
      restore(parent);
      for (const child of parent.children) restore(child);
    }
  }

  window.__LME_sxs = { attach, detach, isEditing, currentMode };
})();
