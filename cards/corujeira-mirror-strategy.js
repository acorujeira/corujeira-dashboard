/* A Corujeira mirror: a dashboard strategy that shows another dashboard with some things taken out, so a second
   screen (the communal kitchen) stays in step with the main dashboard without a copy to keep up to date.
   On each load it reads the source dashboard's config and:
     - drops every card or sub-button whose entity or pop-up hash is in `hide` (at any depth; visibility
       conditions are left alone),
     - sets read_only: true on every corujeira-silo-card when `read_only` is on (pump and creek as status only),
     - merges `set` into cards by entity or by card type (e.g. to widen a tile left alone in its row, or to
       make the Hoot card compact); pop-ups and the cards inside them are left as they are,
     - points links to the source's views (e.g. "/corujeira-bubble/air-24h") at the same views here,
     - optionally regroups a view's sections into columns (`layout`), e.g. three columns on a landscape tablet.
       Each column lists source section indices (0-based, in the source view); their cards are joined in
       that order into one single-width section. Sections not listed follow at the end unchanged. On a
       narrow screen HA stacks the columns in order, so column 1 comes first,
     - passes `kiosk_mode` through for the kiosk-mode plugin (e.g. hide_header: true),
     - with `fit: true`, shrinks the view while it is open so it always fits the screen height without
       scrolling (CSS zoom on the sections view, layout width kept, centred; never below `fit_min`, 0.6),
     - with `fill: true` as well, shorter columns grow to the tallest one's height: the spare space goes
       before each group heading (bubble separator) in the column, or between its cards when it has none,
       so every column ends at the same line. Only while the sections sit side by side.
   Dashboard config:
     strategy:
       type: custom:corujeira-mirror
       source: corujeira-bubble          (url_path of the dashboard to mirror; required)
       hide: [light.outdoor_lantern_7, "#clayhouse"]
       read_only: true                   (default true)
       set: { light.yurt_pendant_lamps: { grid_options: { columns: 12, rows: 2 } },
              "custom:corujeira-hoot-card": { compact: true, navigate: "#nimbu" } }
       kiosk_mode: { hide_header: true }
       fit: true
       fill: true
       layout:                           (optional)
         view: home                      (view path; default the first view)
         columns: [[0, 2], [3, 4, 1], [5, 6]]
         max_columns: 3                  (default the number of columns)
   The dashboard can't be edited in the UI; edit the source instead. Remove this resource to revert. */
(() => {
const errorView = text => ({ views: [{ title: "Mirror", type: "sections", sections: [{ type: "grid", cards: [
  { type: "markdown", content: `**corujeira-mirror:** ${text}` }] }] }] });

// Fit to screen: find the open dashboard's sections view and zoom it so its bottom sits at the bottom of the
// window. The layout width is pinned first, so the cards lay out exactly as they would unzoomed and one
// measurement gives the right zoom. Re-checked every second and on resize (charts load late, advice changes).
const fitter = {
  paths: new Map(), fills: new Set(), el: null, timer: null,
  watch(path, min, fill) {
    this.paths.set(path, Math.max(0.3, Math.min(1, +min || 0.6)));
    if (fill) this.fills.add(path); else this.fills.delete(path);
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), 1000);
      window.addEventListener("resize", () => { this.reset(); this.tick(); });
      window.addEventListener("location-changed", () => setTimeout(() => this.tick(), 50));
    }
    setTimeout(() => this.tick(), 50);
  },
  // shadow-piercing search for the first element with this tag, below a root
  find(root, tag, depth = 0) {
    if (!root || depth > 14) return null;
    const kids = [...(root.children || [])];
    if (root.shadowRoot) kids.unshift(...root.shadowRoot.children);
    for (const k of kids) {
      if (k.localName === tag) return k;
      const f = this.find(k, tag, depth + 1);
      if (f) return f;
    }
    return null;
  },
  // Equal-height columns: work in the view's own (unzoomed) pixels so zoom never feeds back.
  fill(v, on) {
    const root = v.shadowRoot;
    const grid = root && [...root.querySelectorAll("*")].find(e => getComputedStyle(e).display === "grid");
    if (!grid) return;
    const secs = [...grid.children].filter(e => e.offsetHeight > 0);
    const cols = secs.map(sec => {
      const gs = this.find(sec, "hui-grid-section");
      const box = gs && gs.shadowRoot && [...gs.shadowRoot.querySelectorAll("*")].find(e => getComputedStyle(e).display === "grid");
      if (!box) return null;
      const items = [...box.children].filter(e => e.offsetHeight > 0 && getComputedStyle(e).display !== "none");
      const isSep = el => { const b = this.find(el, "bubble-card"), cfg = b && (b.config || b._config); return !!(cfg && cfg.card_type === "separator"); };
      let slots = items.slice(1).filter(isSep);
      if (!slots.length) slots = items.slice(1);
      const old = +(box.dataset.cjFill || 0);
      return { sec, box, items, slots, natural: sec.offsetHeight - old * slots.length };
    }).filter(Boolean);
    const clear = col => { col.items.forEach(it => { if (it.dataset.cjFill) { it.style.marginTop = ""; delete it.dataset.cjFill; } }); delete col.box.dataset.cjFill; };
    const sideBySide = cols.length > 1 && new Set(cols.map(c => c.sec.offsetTop)).size === 1;
    if (!on || !sideBySide) { cols.forEach(clear); return; }
    const target = Math.max(...cols.map(c => c.natural));
    for (const col of cols) {
      const per = col.slots.length ? Math.max(0, (target - col.natural) / col.slots.length) : 0;
      if (Math.abs(per - +(col.box.dataset.cjFill || 0)) < 0.5) continue;
      clear(col);
      if (per < 0.5) continue;
      col.slots.forEach(it => { it.style.marginTop = `${per}px`; it.dataset.cjFill = "1"; });
      col.box.dataset.cjFill = String(per);
    }
  },
  reset() { if (this.el) { const st = this.el.style; st.zoom = st.width = st.marginLeft = st.boxSizing = ""; } },
  tick() {
    const path = location.pathname.split("/")[1], min = this.paths.get(path);
    if (min == null || document.hidden) return;
    if (!this.el || !this.el.isConnected) {
      const ha = document.querySelector("home-assistant");
      const panel = this.find(ha, "ha-panel-lovelace");
      this.el = panel && this.find(panel, "hui-sections-view");
      if (!this.el) return;
    }
    const v = this.el, host = v.parentNode && (v.parentNode.host || v.parentNode);
    try { this.fill(v, this.fills.has(path)); } catch (e) { /* layout internals changed: leave it */ }
    if (!host || !host.getBoundingClientRect) return;
    const W = host.getBoundingClientRect().width, r = v.getBoundingClientRect();
    const avail = window.innerHeight - Math.max(0, r.top);
    if (!W || !r.height || avail < 240) return;
    const z0 = parseFloat(v.style.zoom) || 1;
    const z = Math.min(1, Math.max(min, Math.floor(z0 * avail / r.height * 1000) / 1000));
    if (Math.abs(z - z0) < 0.004 && (z === 1 || v.style.width)) return;
    v.style.zoom = z === 1 ? "" : String(z);
    v.style.width = z === 1 ? "" : `${W}px`;
    v.style.boxSizing = z === 1 ? "" : "border-box";
    v.style.marginLeft = z === 1 ? "" : `${W * (1 - z) / (2 * z)}px`;
  },
};

class CorujeiraMirrorStrategy extends HTMLElement {
  static async generate(c, hass) {
    if (!c.source) return errorView("set `source` to the url_path of the dashboard to mirror.");
    let cfg;
    try {
      cfg = await hass.callWS({ type: "lovelace/config", url_path: c.source });
    } catch (e) {
      return errorView(`could not read dashboard "${c.source}" (${(e && e.message) || e}).`);
    }
    if (!cfg || !Array.isArray(cfg.views)) return errorView(`dashboard "${c.source}" has no views to mirror.`);
    const hide = new Set(c.hide || []), set = c.set || {};
    const readOnly = c.read_only !== false;
    const here = location.pathname.split("/")[1];
    const from = `/${c.source}/`, to = here && here !== c.source ? `/${here}/` : null;

    const hidden = o => o && typeof o === "object" && !Array.isArray(o) && !("condition" in o) &&
      (hide.has(o.entity) || hide.has(o.hash));
    const walk = (o, inPop) => {
      if (Array.isArray(o)) return o.filter(x => !hidden(x)).map(x => walk(x, inPop));
      if (o && typeof o === "object") {
        const pop = inPop || o.card_type === "pop-up", out = {};
        for (const [k, v] of Object.entries(o)) out[k] = walk(v, pop);
        if (out.type && !("condition" in out) && !pop) {
          if (set[out.entity]) Object.assign(out, set[out.entity]);
          if (set[out.type]) Object.assign(out, set[out.type]);
        }
        if (readOnly && out.type === "custom:corujeira-silo-card") out.read_only = true;
        return out;
      }
      if (typeof o === "string" && to && o.includes(from)) return o.split(from).join(to);
      return o;
    };
    const out = walk(cfg, false);
    if (c.kiosk_mode) out.kiosk_mode = c.kiosk_mode;
    if (c.fit && here) fitter.watch(here, c.fit_min, c.fill);
    const lay = c.layout;
    if (lay && Array.isArray(lay.columns) && lay.columns.length) {
      const view = lay.view ? out.views.find(v => v.path === lay.view) : out.views[0];
      if (view && Array.isArray(view.sections)) {
        const src = view.sections, used = new Set();
        const cols = lay.columns.map(idx => {
          const cards = [];
          for (const i of [].concat(idx)) {
            if (!src[i] || used.has(i)) continue;
            used.add(i);
            cards.push(...(src[i].cards || []));
          }
          return { type: "grid", cards };
        }).filter(sec => sec.cards.length);
        view.sections = [...cols, ...src.filter((_, i) => !used.has(i))];
        view.max_columns = lay.max_columns || cols.length;
      }
    }
    return out;
  }
}
if (!customElements.get("ll-strategy-dashboard-corujeira-mirror"))
  customElements.define("ll-strategy-dashboard-corujeira-mirror", CorujeiraMirrorStrategy);
})();
