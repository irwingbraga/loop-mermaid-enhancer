/* theme.js — detect Loop's current light/dark mode.
 *
 * Loop scopes its Fluent design tokens to a `<div class="fui-FluentProvider">`
 * element (style="color-scheme: dark;" or light), NOT to :root. Reading the
 * tokens from `document.documentElement` therefore returns nothing, and falling
 * back to `prefers-color-scheme` reflects the OS — not Loop's own setting.
 *
 * The reliable signal: find the closest FluentProvider on the page and look at
 * its inline `color-scheme`. There can be multiple (one per top-level Fluent
 * region) — they all carry the same scheme in practice, so picking the first
 * is fine.
 */
(() => {
  const FP_SEL = '.fui-FluentProvider, [data-testid="ComponentFluentProviderId"]';

  function rgbLuminance(rgb) {
    let r, g, b;
    const m = /rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/.exec(rgb);
    if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
    else if (rgb.startsWith('#') && rgb.length >= 7) {
      r = parseInt(rgb.slice(1, 3), 16);
      g = parseInt(rgb.slice(3, 5), 16);
      b = parseInt(rgb.slice(5, 7), 16);
    } else { return 1; }
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function currentTheme() {
    const fp = document.querySelector(FP_SEL);
    if (fp) {
      // Inline `color-scheme` is the explicit signal Loop sets per theme.
      const inlineCs = (fp.style?.colorScheme || '').toLowerCase();
      if (inlineCs.includes('dark') && !inlineCs.includes('light')) return 'dark';
      if (inlineCs.includes('light') && !inlineCs.includes('dark')) return 'light';
      // Fallback inside the provider: read the actual neutral background var.
      const bg = getComputedStyle(fp).getPropertyValue('--colorNeutralBackground1').trim();
      if (bg) return rgbLuminance(bg) < 0.5 ? 'dark' : 'light';
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /** Subscribe; cb is called with 'light' | 'dark' whenever it changes. */
  function onThemeChange(cb) {
    let last = currentTheme();
    cb(last);
    const obs = new MutationObserver(() => {
      const next = currentTheme();
      if (next !== last) { last = next; cb(next); }
    });
    // Watch attribute changes anywhere — FluentProvider may be mounted later,
    // and Loop toggles dark mode by flipping `style.colorScheme` on it.
    obs.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    const mqlListener = () => { const next = currentTheme(); if (next !== last) { last = next; cb(next); } };
    mql?.addEventListener?.('change', mqlListener);
    return () => { obs.disconnect(); mql?.removeEventListener?.('change', mqlListener); };
  }

  window.__LME_theme = { currentTheme, onThemeChange };
})();
