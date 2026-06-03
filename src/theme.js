/* theme.js — detect Loop's current light/dark mode so our modal/toolbar blend in.
 *
 * Loop is built on Fluent UI v9 (Griffel). It sets CSS custom properties like
 * --colorNeutralBackground1 on :root. We sample one of those and decide light/dark
 * from its luminance. This is robust against unannounced theme renames because we
 * never hard-code class names.
 */
(() => {
  const PROBE_VAR = '--colorNeutralBackground1';

  function rgbLuminance(rgb) {
    // rgb expected as "rgb(r, g, b)" or "rgba(r, g, b, a)" or "#rrggbb"
    let r, g, b;
    const m = /rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/.exec(rgb);
    if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
    else if (rgb.startsWith('#') && rgb.length >= 7) {
      r = parseInt(rgb.slice(1, 3), 16);
      g = parseInt(rgb.slice(3, 5), 16);
      b = parseInt(rgb.slice(5, 7), 16);
    } else { return 1; }
    // perceived luminance, 0-1
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function currentTheme() {
    const probe = getComputedStyle(document.documentElement).getPropertyValue(PROBE_VAR).trim();
    if (probe) return rgbLuminance(probe) < 0.5 ? 'dark' : 'light';
    // Fallback to media query
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /** Subscribe; cb is called with 'light' | 'dark' whenever it changes. Returns an unsubscribe fn. */
  function onThemeChange(cb) {
    let last = currentTheme();
    cb(last);
    const obs = new MutationObserver(() => {
      const next = currentTheme();
      if (next !== last) { last = next; cb(next); }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    const mqlListener = () => { const next = currentTheme(); if (next !== last) { last = next; cb(next); } };
    mql?.addEventListener?.('change', mqlListener);
    return () => { obs.disconnect(); mql?.removeEventListener?.('change', mqlListener); };
  }

  window.__LME_theme = { currentTheme, onThemeChange };
})();
