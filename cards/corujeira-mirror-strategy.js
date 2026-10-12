/* A Corujeira mirror: a dashboard strategy that shows another dashboard with some things taken out, so a second
   screen (the communal kitchen) stays in step with the main dashboard without a copy to keep up to date.
   On each load it reads the source dashboard's config and:
     - drops every card or sub-button whose entity or pop-up hash is in `hide` (at any depth; visibility
       conditions are left alone),
     - sets read_only: true on every corujeira-silo-card when `read_only` is on (pump and creek as status only),
     - merges `set` into cards (not pop-ups) by entity (e.g. to widen a tile left alone in its row),
     - points links to the source's views (e.g. "/corujeira-bubble/air-24h") at the same views here.
   Dashboard config:
     strategy:
       type: custom:corujeira-mirror
       source: corujeira-bubble          (url_path of the dashboard to mirror; required)
       hide: [light.outdoor_lantern_7, "#clayhouse"]
       read_only: true                   (default true)
       set: { light.yurt_pendant_lamps: { grid_options: { columns: 12, rows: 2 } } }
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
    return walk(cfg);
  }
}
if (!customElements.get("ll-strategy-dashboard-corujeira-mirror"))
  customElements.define("ll-strategy-dashboard-corujeira-mirror", CorujeiraMirrorStrategy);
})();
