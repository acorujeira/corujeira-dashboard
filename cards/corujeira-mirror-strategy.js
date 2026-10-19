/* A Corujeira mirror: a dashboard strategy that shows another dashboard with some things taken out, so a second
   screen (the communal kitchen) stays in step with the main dashboard without a copy to keep up to date.
   On each load it reads the source dashboard's config and:
     - drops every card or sub-button whose entity or pop-up hash is in `hide` (at any depth; visibility
       conditions are left alone),
     - sets read_only: true on every corujeira-silo-card when `read_only` is on (pump and creek as status only),
     - merges `set` into cards (not pop-ups) by entity (e.g. to widen a tile left alone in its row),
     - points links to the source's views (e.g. "/corujeira-bubble/air-24h") at the same views here,
     - optionally regroups a view's sections into columns (`layout`), e.g. three columns on a landscape tablet.
       Each column lists source section indices (0-based, in the source view); their cards are joined in
       that order into one single-width section. Sections not listed follow at the end unchanged. On a
       narrow screen HA stacks the columns in order, so column 1 comes first.
   Dashboard config:
     strategy:
       type: custom:corujeira-mirror
       source: corujeira-bubble          (url_path of the dashboard to mirror; required)
       hide: [light.outdoor_lantern_7, "#clayhouse"]
       read_only: true                   (default true)
       set: { light.yurt_pendant_lamps: { grid_options: { columns: 12, rows: 2 } } }
       layout:                           (optional)
         view: home                      (view path; default the first view)
         columns: [[0, 2], [3, 4, 1], [5, 6]]
         max_columns: 3                  (default the number of columns)
   The dashboard can't be edited in the UI; edit the source instead. Remove this resource to revert. */
(() => {
const errorView = text => ({ views: [{ title: "Mirror", type: "sections", sections: [{ type: "grid", cards: [
  { type: "markdown", content: `**corujeira-mirror:** ${text}` }] }] }] });

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
    const walk = o => {
      if (Array.isArray(o)) return o.filter(x => !hidden(x)).map(walk);
      if (o && typeof o === "object") {
        const out = {};
        for (const [k, v] of Object.entries(o)) out[k] = walk(v);
        if (out.type && !("condition" in out) && out.card_type !== "pop-up") {
          const extra = set[out.entity];
          if (extra) Object.assign(out, extra);
        }
        if (readOnly && out.type === "custom:corujeira-silo-card") out.read_only = true;
        return out;
      }
      if (typeof o === "string" && to && o.includes(from)) return o.split(from).join(to);
      return o;
    };
    const out = walk(cfg);
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
