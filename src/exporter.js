/* exporter.js — walk a Loop page's DOM and emit Markdown.
 *
 * Strategy: recursive walk that emits Markdown when it recognises a "block"
 * and skips (does not recurse into) that block's subtree. Any unrecognised
 * wrapper div is transparent — we recurse into its children looking for
 * blocks deeper down. That's the only way to survive Loop's many editor
 * wrapper layers (highlightWrapper, pageFrame, hosting-element, ...).
 *
 * Confirmed selectors from real DOM samples (do NOT depend on Griffel
 * atomic classes like ___xxx / fxxx — those change every Loop release):
 *
 *   Block-level
 *     [role="heading"][aria-level]            → # heading
 *     hr.scriptor-horizontal-divider          → ---
 *     ul                                      → bullet list
 *     ol                                      → numbered list
 *     table                                   → md table
 *     .scriptor-component-code-block          → ``` fenced code
 *     .scriptor-paragraph                     → plain paragraph
 *
 *   Inline (within a paragraph or list item, per <span class="scriptor-textRun scriptor-inline">)
 *     style="font-weight: 6xx | 7xx | bold"   → **bold**
 *     style="font-style: italic"              → *italic*
 *     class contains scriptor-code-editor     → `code`   (NB: only inline; nested inside a
 *                                                   .scriptor-component-code-block this rule
 *                                                   doesn't fire because the code-block handler
 *                                                   consumes the whole subtree first)
 *     class contains scriptor-hyperlink + title="URL" → [text](URL)
 *
 * TODO (need real DOM samples to lock in selectors):
 *   - Ordered lists (my sample only had bullets — best guess: same <ol>/<li> pattern
 *     with a scriptor-listItem-marker-number class)
 *   - Task lists / checkboxes (Loop names them "checklist" in the UI)
 *   - Block quotes / callouts
 */
(() => {
  // ---------- ENTRY POINT ----------

  /** Convert a Loop <article> or page-body element to Markdown. */
  function pageToMarkdown(root) {
    if (!root) return '';
    const out = [];
    emitChildren(root, out, 0);
    return normalise(out.join('\n\n'));
  }

  /** Loop's page root is <article> under the main region. Falls back to the
   * scriptor-pageBody / scriptor-simpleView if the article isn't found (older
   * page templates). */
  function findPageRoot(doc = document) {
    return (
      doc.querySelector('article[class*="scriptor"], article') ||
      doc.querySelector('.scriptor-pageBody') ||
      doc.querySelector('.scriptor-simpleView') ||
      doc.querySelector('.scriptor-pageContainer') ||
      null
    );
  }

  // ---------- WALKER ----------

  function emitChildren(node, out, listDepth) {
    for (const child of node.children) {
      const md = blockToMarkdown(child, listDepth);
      if (md === null) {
        // Not a recognised block — recurse into it looking for blocks deeper.
        emitChildren(child, out, listDepth);
      } else if (md !== '') {
        out.push(md);
      }
    }
  }

  /** Return Markdown for a recognised block, `''` for a recognised-but-empty
   * block, or `null` to signal "not a block, keep walking".
   *
   * Priority matters: Loop wraps *everything* — including hosted code blocks,
   * tables, and lists — inside `<div class="scriptor-paragraph">`. If we let
   * the paragraph branch fire first, we'd scrape a code block's toolbar text
   * as body content. So we look at what's *inside* the paragraph before
   * deciding it's a paragraph. Order below reflects that.
   */
  function blockToMarkdown(el, listDepth) {
    if (!(el instanceof Element)) return null;
    if (isDecorativeArtifact(el)) return '';

    // First gate: is this element even a block candidate? A generic wrapper
    // div (pageBody, pageFrame, canvas, …) returns null and lets the walker
    // recurse. Only elements that carry one of the recognised markers get
    // dispatched further.
    const isHeading = el.getAttribute('role') === 'heading';
    const isPara = el.classList.contains('scriptor-paragraph');
    const isListWrap = el.classList.contains('scriptor-listItem');
    const isHost = el.classList.contains('scriptor-hosting-element');
    const isNativeList = el.tagName === 'UL' || el.tagName === 'OL';
    const isNativeTable = el.tagName === 'TABLE';
    const isCB = el.classList.contains('scriptor-component-code-block');
    const isHr = el.tagName === 'HR';

    if (!(isHeading || isPara || isListWrap || isHost || isNativeList ||
          isNativeTable || isCB || isHr)) {
      return null;
    }

    // 1. Heading.
    if (isHeading) {
      const lvl = Math.max(1, Math.min(6, parseInt(el.getAttribute('aria-level') || '1', 10)));
      const text = inlineToMarkdown(el);
      return text ? `${'#'.repeat(lvl)} ${text}` : '';
    }

    // 2. Divider (either bare <hr> or wrapped in a paragraph).
    if (isHr) return '---';
    if (isPara && el.querySelector(':scope > hr.scriptor-horizontal-divider')) return '---';

    // 3. List — native, listItem-wrapped paragraph, or paragraph containing a direct <ul>/<ol>.
    if (isNativeList) return listToMarkdown(el, el.tagName === 'OL', listDepth);
    if (isListWrap || (isPara && el.querySelector(':scope > ul, :scope > ol'))) {
      const list = el.querySelector(':scope > ul, :scope > ol') || el.querySelector('ul, ol');
      if (list) return listToMarkdown(list, list.tagName === 'OL', listDepth);
    }

    // 4. Hosted components — Loop wraps code blocks & tables inside
    //    <div class="scriptor-paragraph"><span class="scriptor-inline">
    //      <div class="scriptor-hosting-element scriptor-component-block">…
    //    We look inside the paragraph (or the host itself) for those markers.
    const host = isHost ? el : (isPara ? el.querySelector(':scope .scriptor-hosting-element') : null);
    if (host) {
      const cb = host.querySelector('.scriptor-component-code-block');
      if (cb) return codeBlockToMarkdown(cb);
      // Loop tables ship as TWO <table>s inside the same host: a
      // `column-grabber-table` shell for drag handles (always 1 empty row),
      // and a `user-data-table` with the actual data. Prefer the data one.
      const tbl = host.querySelector('table[data-automation-type="user-data-table"]') ||
                  host.querySelector('table');
      if (tbl) return tableToMarkdown(tbl);
      // Recognised host but unknown component — skip silently instead of
      // scraping its toolbar text as if it were paragraph content.
      return '';
    }

    // 5. Direct-hit variants (a top-level <table> or code block not wrapped in a paragraph).
    if (isCB) return codeBlockToMarkdown(el);
    if (isNativeTable) return tableToMarkdown(el);

    // 6. Plain paragraph (no hosted content, no list, no divider).
    if (isPara) {
      const text = inlineToMarkdown(el);
      return text || '';
    }

    return null;
  }

  // ---------- BLOCK HANDLERS ----------

  function listToMarkdown(listEl, ordered, depth) {
    const lines = [];
    let idx = 1;
    for (const li of listEl.children) {
      if (li.tagName !== 'LI') continue;
      const indent = '  '.repeat(depth);
      const bullet = ordered ? `${idx}.` : '-';
      const text = inlineToMarkdown(li);
      lines.push(`${indent}${bullet} ${text}`);
      idx++;
      // Nested lists inside the <li>
      for (const child of li.children) {
        if (child.tagName === 'UL') lines.push(listToMarkdown(child, false, depth + 1));
        else if (child.tagName === 'OL') lines.push(listToMarkdown(child, true, depth + 1));
      }
    }
    return lines.join('\n');
  }

  function tableToMarkdown(tableEl) {
    // Extract rows in DOM order. Loop labels the header row with data-rowid="HEADER_ROW_ID".
    const rows = Array.from(tableEl.querySelectorAll('tr'));
    const grid = [];
    let headerIdx = 0;
    rows.forEach((tr, i) => {
      const cells = Array.from(tr.querySelectorAll(':scope > th, :scope > td'))
        // Skip grabber / hidden cells Loop injects for drag handles.
        .filter(c => c.getAttribute('aria-hidden') !== 'true' && c.getAttribute('data-testid') !== 'grabber-cell-id')
        .map(c => inlineToMarkdown(c).replace(/\|/g, '\\|') || ' ');
      if (cells.length === 0) return;
      if (tr.getAttribute('data-rowid') === 'HEADER_ROW_ID') headerIdx = grid.length;
      grid.push(cells);
    });
    if (grid.length === 0) return '';
    // If no explicit header, treat the first row as header.
    const header = grid[headerIdx];
    const body = grid.slice(headerIdx + 1);
    const sep = header.map(() => '---');
    const lines = [
      `| ${header.join(' | ')} |`,
      `| ${sep.join(' | ')} |`,
      ...body.map(row => `| ${row.join(' | ')} |`),
    ];
    return lines.join('\n');
  }

  function codeBlockToMarkdown(cb) {
    // Language is on the top-toolbar dropdown; falls back to '' if user hasn't chosen one.
    const langBtn = cb.querySelector('#language-selector');
    const rawLang = (langBtn?.getAttribute('value') || langBtn?.textContent || '').trim();
    const lang = normaliseLang(rawLang);

    // The source lines are <div class="scriptor-paragraph" data-line-number="N">
    // in the editor container. Sort by line number to be safe (usually already in order).
    const lineNodes = Array.from(
      cb.querySelectorAll('[aria-label="Code editor"] .scriptor-paragraph[data-line-number]')
    );
    if (lineNodes.length === 0) {
      // Fallback: any scriptor-paragraph in the block
      const anyLines = Array.from(cb.querySelectorAll('.scriptor-paragraph'));
      lineNodes.push(...anyLines);
    }
    lineNodes.sort((a, b) => {
      const na = parseInt(a.getAttribute('data-line-number') || '0', 10);
      const nb = parseInt(b.getAttribute('data-line-number') || '0', 10);
      return na - nb;
    });
    // Inside code blocks the text is the raw source — no MD formatting to apply.
    const source = lineNodes.map(ln => plainTextRun(ln)).join('\n').replace(/\s+$/, '');
    // Guard against source that itself contains ``` — extend fence length.
    const fence = pickFence(source);
    return `${fence}${lang}\n${source}\n${fence}`;
  }

  function normaliseLang(raw) {
    const l = raw.toLowerCase().trim();
    if (!l || l === 'plain text' || l === 'plaintext' || l === 'none') return '';
    // Loop shows "Mermaid" / "TypeScript" / "C#" etc; Markdown wants lowercase idiomatic tags.
    const map = { 'c#': 'csharp', 'c++': 'cpp', 'objective-c': 'objc', 'shell': 'bash' };
    return map[l] || l.replace(/\s+/g, '-');
  }

  function pickFence(source) {
    let n = 3;
    for (const m of source.matchAll(/`{3,}/g)) n = Math.max(n, m[0].length + 1);
    return '`'.repeat(n);
  }

  // ---------- INLINE HANDLER ----------

  /** Convert the inline content of `el` (paragraph, heading, list item, table cell)
   * to Markdown. Walks textRun spans and applies bold/italic/code/link based on
   * their inline style and class. */
  function inlineToMarkdown(el) {
    const out = [];
    for (const node of el.childNodes) walkInline(node, out);
    return collapseFormatting(out.join('')).trim();
  }

  function walkInline(node, out) {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(escapeMd(node.nodeValue));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;

    // Skip Loop's invisible / decorative elements.
    if (el.getAttribute?.('aria-hidden') === 'true') return;
    if (el.classList?.contains('scriptor-nonDisplayable-textRun')) return;
    if (el.tagName === 'BR' && el.classList?.contains('scriptor-EOP')) return;
    // The per-block hover menu ("Block Context Menu")
    if (el.classList?.contains('scriptor-blocks-commands-hover')) return;
    if (el.classList?.contains('scriptor-blocks-commands-wrapper')) return;
    if (el.tagName === 'SQUIGGLER' || el.tagName === 'EDITOR-SQUIGGLER') return;

    // A scriptor-textRun span carries the actual character run + its formatting.
    if (el.classList?.contains('scriptor-textRun') && el.classList?.contains('scriptor-inline')) {
      out.push(formatRun(el));
      return;
    }

    // Images (rare inside text; usually a content image is its own block, but images
    // do sometimes appear inline as emoji-style stickers).
    if (el.tagName === 'IMG' && isContentImage(el)) {
      const alt = el.getAttribute('alt') || '';
      const src = el.getAttribute('src') || '';
      out.push(`![${escapeMd(alt)}](${src})`);
      return;
    }

    // Line break inside a paragraph
    if (el.tagName === 'BR') { out.push('  \n'); return; }

    // Anything else — recurse into children.
    for (const c of el.childNodes) walkInline(c, out);
  }

  /** Wrap a single textRun span's text in the correct MD formatting. */
  function formatRun(span) {
    let text = span.textContent || '';
    if (!text) return '';
    // Loop injects U+2060 (word joiner) and NBSPs around block edges — leave NBSP
    // alone but strip WJ so it doesn't leak into MD.
    text = text.replace(/⁠/g, '');
    if (!text) return '';

    const style = span.getAttribute('style') || '';
    const cls = span.classList;
    const isBold = /font-weight:\s*(?:bold|[6-9]\d\d)/.test(style);
    const isItalic = /font-style:\s*italic/.test(style);
    const isCode = cls.contains('scriptor-code-editor');
    const isLink = cls.contains('scriptor-hyperlink');

    // Inline code beats bold/italic (inside a code span, ** and * are literal).
    if (isCode) {
      // Choose backtick count that doesn't collide with the source.
      const ticks = pickBackticks(text);
      return `${ticks}${text}${ticks}`;
    }

    let md = escapeMd(text);
    if (isBold && isItalic) md = `***${md}***`;
    else if (isBold) md = `**${md}**`;
    else if (isItalic) md = `*${md}*`;

    if (isLink) {
      const url = span.getAttribute('title') || span.getAttribute('href') || '';
      // Bracket the already-formatted content so bold/italic survive inside links.
      md = `[${md}](${url})`;
    }
    return md;
  }

  /** Raw text of a code-block source line (no MD formatting). */
  function plainTextRun(el) {
    // Concatenate text of every span child; ignore scriptor-EOP / hidden.
    let out = '';
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) { out += n.nodeValue; continue; }
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      if (n.getAttribute?.('aria-hidden') === 'true') continue;
      if (n.classList?.contains('scriptor-nonDisplayable-textRun')) continue;
      if (n.tagName === 'BR') continue;
      if (n.tagName === 'SQUIGGLER' || n.tagName === 'EDITOR-SQUIGGLER') continue;
      out += plainTextRun(n);
    }
    // Loop sometimes uses the class "Apple-converted-space" containing NBSPs
    // in place of consecutive regular spaces — keep them as-is; the mermaid
    // renderer and most syntax highlighters treat NBSP the same way anyway.
    return out.replace(/⁠/g, '');
  }

  function pickBackticks(text) {
    let n = 1;
    for (const m of text.matchAll(/`+/g)) n = Math.max(n, m[0].length + 1);
    return '`'.repeat(n);
  }

  // ---------- HELPERS ----------

  function isDecorativeArtifact(el) {
    if (!el.classList) return false;
    return (
      el.classList.contains('scriptor-code-scroll-proxy') ||
      el.classList.contains('scriptor-highlightWrapper') ||
      el.classList.contains('scriptor-blocks-commands-hover') ||
      el.classList.contains('scriptor-blocks-commands-wrapper') ||
      // Loop's tabster / accessibility scaffolding
      el.getAttribute('data-tabster-dummy') !== null
    );
  }

  function isContentImage(img) {
    if (img.classList?.contains('fui-Image')) return false;   // toolbar icon
    if (img.classList?.contains('fui-Avatar__image')) return false; // user avatar
    if (img.closest?.('.fui-Avatar')) return false;
    if (img.getAttribute('role') === 'presentation') return false;
    return true;
  }

  /** Escape characters that would be misread as Markdown syntax. Kept
   * conservative on purpose — over-escaping produces ugly output like
   * `foo\_bar\_baz`. We escape:
   *   - backslash (structural)
   *   - backticks (would break inline code detection when we re-wrap)
   *   - `[` and `]` (link syntax)
   *   - `*` (bold/italic markers)
   *
   * Underscores are NOT escaped — GFM only treats `_` as emphasis at word
   * boundaries, so mid-word underscores like class-name segments render fine
   * without escaping and read better without visible backslashes. */
  function escapeMd(text) {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/([*`[\]])/g, '\\$1');
  }

  /** Cleanup pass: dedupe blank lines, trim, join adjacent formatting where
   * possible (e.g. `**a****b**` → `**ab**` — happens when two consecutive
   * textRuns share formatting). */
  function collapseFormatting(s) {
    return s
      .replace(/\*\*\*\*/g, '')
      .replace(/\*\*_/g, '**_').replace(/_\*\*/g, '_**')
      .replace(/`([^`\n]*)``([^`\n]*)`/g, (_m, a, b) => '`' + a + b + '`');
  }

  function normalise(md) {
    return md
      .split('\n')
      .map(line => line.replace(/[ \t]+$/g, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n';
  }

  window.__LME_export_md = { pageToMarkdown, findPageRoot };
})();
