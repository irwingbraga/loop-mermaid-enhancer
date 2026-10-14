/* subtree-export.js — adds "Download subtree as Markdown" to the sidebar
 * page-node menu ("More Page options"). Exports the node and all of its
 * nested pages into a .zip whose folders mirror the tree.
 *
 * Loop's sidebar is a flat Fluent `role="tree"`: hierarchy is `aria-level`,
 * not DOM nesting, and collapsed branches are not rendered. Other pages'
 * content is not in the DOM either, so we visit each page (click its node),
 * wait for the editor to settle, then reuse exporter.js on it.
 *
 * Stable hooks (from a saved sample):
 *   [role="treeitem"][data-element-id][title][aria-level][aria-expanded]
 *   [data-testid="CollapsiblePageMenu"]    — the "More Page options" button
 *   [data-testid="CollapsiblePageChevron"] — expand/collapse chevron
 */
(() => {
  const ITEM_SEL = '[role="tree"] [role="treeitem"][data-element-id]';
  const MENU_BTN_SEL = '[data-testid="CollapsiblePageMenu"]';
  const MENU_LABEL = 'Download subtree as Markdown';
  const MARK = 'data-lme-subtree';
  const PANEL_ID = 'lme-subtree-panel';

  let triggerId = null;   // data-element-id of the node whose menu was opened
  let running = false;
  let cancelled = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => (window.CSS?.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'));

  // ---------- tracking which node opened the menu ----------

  function noteTrigger(e) {
    const item = e.target.closest?.('[role="treeitem"][data-element-id]');
    if (!item) return;
    // Only the more-button or a right click open the page menu.
    if (e.type === 'click' && !e.target.closest(MENU_BTN_SEL)) return;
    triggerId = item.getAttribute('data-element-id');
  }
  document.addEventListener('click', noteTrigger, true);
  document.addEventListener('contextmenu', noteTrigger, true);

  // ---------- menu injection ----------

  function injectInto(menu) {
    if (menu.querySelector(`[${MARK}]`)) return;
    if (!triggerId || !document.querySelector(`${ITEM_SEL}[data-element-id="${esc(triggerId)}"]`)) return;
    // Only page-node menus: they come from the sidebar tree, so triggerId is set
    // by noteTrigger. Other menus (e.g. editor menus) never set it.
    const proto = menu.querySelector('[role="menuitem"]');
    if (!proto) return;
    const li = proto.cloneNode(true);
    li.setAttribute(MARK, '1');
    li.removeAttribute('id');
    li.removeAttribute('aria-disabled');
    // Replace icon + text with our label, keeping the wrapper styling.
    li.querySelectorAll('svg').forEach((s) => s.remove());
    const leaf = deepestTextElement(li);
    leaf.textContent = MENU_LABEL;
    const id = triggerId;
    li.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      menu.style.display = 'none';
      exportSubtree(id);
    });
    proto.parentElement.appendChild(li);
  }

  function deepestTextElement(root) {
    let el = root;
    for (;;) {
      const next = Array.from(el.children).find((c) => c.textContent.trim());
      if (!next) return el;
      el = next;
    }
  }

  const menuObs = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (!(n instanceof Element)) continue;
        const menu = n.matches('[role="menu"]') ? n : n.querySelector('[role="menu"]');
        if (menu) injectInto(menu);
      }
    }
  });
  menuObs.observe(document.body, { childList: true, subtree: true });

  // ---------- tree helpers ----------

  const allItems = () => Array.from(document.querySelectorAll(ITEM_SEL));
  const levelOf = (el) => parseInt(el.getAttribute('aria-level') || '1', 10);
  const itemById = (id) => document.querySelector(`${ITEM_SEL}[data-element-id="${esc(id)}"]`);

  function descendantsOf(item) {
    const items = allItems();
    const i = items.indexOf(item);
    const lvl = levelOf(item);
    const out = [];
    for (let j = i + 1; j < items.length && levelOf(items[j]) > lvl; j++) out.push(items[j]);
    return out;
  }

  /** Expand every collapsed branch under (and including) the root. Returns the
   * ids we expanded so they can be collapsed again afterwards. */
  async function expandAll(rootId) {
    const expanded = [];
    for (let pass = 0; pass < 20 && !cancelled; pass++) {
      const root = itemById(rootId);
      if (!root) break;
      const collapsed = [root, ...descendantsOf(root)]
        .filter((el) => el.getAttribute('aria-expanded') === 'false');
      if (!collapsed.length) break;
      for (const el of collapsed) {
        const chev = el.querySelector('[data-testid="CollapsiblePageChevron"]');
        (chev || el).click();
        expanded.push(el.getAttribute('data-element-id'));
      }
      await sleep(350);
    }
    return expanded;
  }

  async function collapse(ids) {
    for (const id of ids.reverse()) {
      const el = itemById(id);
      if (el?.getAttribute('aria-expanded') === 'true') {
        (el.querySelector('[data-testid="CollapsiblePageChevron"]') || el).click();
      }
    }
  }

  function snapshot(rootId) {
    const root = itemById(rootId);
    const nodes = [root, ...descendantsOf(root)].map((el) => ({
      id: el.getAttribute('data-element-id'),
      title: el.getAttribute('title') || 'Untitled',
      level: levelOf(el),
    }));
    // parent index via a level stack
    const stack = [];
    nodes.forEach((n, idx) => {
      while (stack.length && nodes[stack[stack.length - 1]].level >= n.level) stack.pop();
      n.parent = stack.length ? stack[stack.length - 1] : -1;
      n.hasChildren = idx + 1 < nodes.length && nodes[idx + 1].level > n.level;
      stack.push(idx);
    });
    return nodes;
  }

  // ---------- page visiting ----------

  function currentTitle() {
    const h1 = document.querySelector('[role="heading"][aria-level="1"]');
    return h1?.textContent?.trim() || '';
  }

  function renderCurrentPage(title) {
    const md = window.__LME_export_md;
    const root = md.findPageRoot();
    if (!root) return null;
    const body = md.pageToMarkdown(root);
    return `# ${title}\n\n${body}\n`;
  }

  async function visit(node, prevHref) {
    const el = itemById(node.id);
    if (!el) return { md: null, error: 'node not found in sidebar' };
    const alreadyThere = el.getAttribute('aria-selected') === 'true' && currentTitle() === node.title;
    if (!alreadyThere) {
      const target = el.querySelector('[aria-labelledby]') || el;
      target.click();
    }
    // Wait for navigation.
    const t0 = Date.now();
    while (!cancelled && Date.now() - t0 < 15000) {
      if (alreadyThere || location.href !== prevHref || currentTitle() === node.title) break;
      await sleep(150);
    }
    // Wait for content to settle: same output twice in a row.
    let last = null;
    let same = 0;
    while (!cancelled && Date.now() - t0 < 25000) {
      await sleep(400);
      const md = renderCurrentPage(node.title);
      if (md && md === last) { if (++same >= 2) return { md }; } else { same = 0; last = md; }
    }
    return last ? { md: last } : { md: null, error: 'page did not load' };
  }

  // ---------- paths ----------

  const safe = (s) => s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Untitled';

  function assignPaths(nodes) {
    const used = new Set();
    const dirs = [];
    nodes.forEach((n, idx) => {
      const parentDir = n.parent >= 0 ? dirs[n.parent] : '';
      let name = safe(n.title);
      let dir = parentDir + name;
      let k = 2;
      const key = (p) => p.toLowerCase();
      while (used.has(key(dir))) dir = `${parentDir}${name} (${k++})`;
      used.add(key(dir));
      const base = dir.slice(parentDir.length);
      dirs[idx] = n.hasChildren ? dir + '/' : parentDir;
      n.path = n.hasChildren ? `${dir}/${base}.md` : `${dir}.md`;
    });
  }

  // ---------- progress UI ----------

  function showPanel() {
    let p = document.getElementById(PANEL_ID);
    if (p) return p;
    p = document.createElement('div');
    p.id = PANEL_ID;
    p.innerHTML = `
      <div class="lme-sub__text">Preparing…</div>
      <button class="lme-md-btn" data-act="cancel">Cancel</button>`;
    p.querySelector('[data-act="cancel"]').addEventListener('click', () => { cancelled = true; });
    document.body.appendChild(p);
    return p;
  }
  const setPanel = (text) => { const p = document.getElementById(PANEL_ID); if (p) p.querySelector('.lme-sub__text').textContent = text; };
  const hidePanel = () => document.getElementById(PANEL_ID)?.remove();

  // ---------- orchestration ----------

  async function exportSubtree(rootId) {
    if (running) return;
    running = true;
    cancelled = false;
    showPanel();
    const originalId = document.querySelector(`${ITEM_SEL}[aria-selected="true"]`)?.getAttribute('data-element-id');
    let expanded = [];
    try {
      setPanel('Expanding tree…');
      expanded = await expandAll(rootId);
      const nodes = snapshot(rootId);
      assignPaths(nodes);

      const files = [];
      const failures = [];
      for (let i = 0; i < nodes.length && !cancelled; i++) {
        const n = nodes[i];
        setPanel(`Exporting ${i + 1}/${nodes.length}: ${n.title}`);
        const { md, error } = await visit(n, location.href);
        if (md) files.push({ path: n.path, content: md });
        else failures.push(`${n.title}: ${error}`);
      }
      if (cancelled) { setPanel('Cancelled'); await sleep(900); return; }

      if (failures.length) {
        files.push({ path: '_export-errors.txt', content: failures.join('\n') + '\n' });
      }
      const blob = window.__LME_zip.buildZip(files);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safe(nodes[0].title)}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setPanel(failures.length ? `Done with ${failures.length} error(s)` : `Done: ${files.length} pages`);
      await sleep(1500);
    } catch (err) {
      console.error('[LME] subtree export failed:', err);
      setPanel('Failed, see console');
      await sleep(2500);
    } finally {
      await collapse(expanded);
      // Return the user to the page they were on.
      if (originalId && document.querySelector(`${ITEM_SEL}[aria-selected="true"]`)?.getAttribute('data-element-id') !== originalId) {
        const el = itemById(originalId);
        (el?.querySelector('[aria-labelledby]') || el)?.click();
      }
      hidePanel();
      running = false;
    }
  }

  window.__LME_subtree = { exportSubtree, snapshot };
})();
