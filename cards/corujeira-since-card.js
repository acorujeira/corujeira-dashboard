/* A Corujeira since: wraps an apexcharts-card so its time axis starts at a date held in Home Assistant
   (an input_datetime such as input_datetime.hot_compost_built) and ends now. The wrapper sets the inner
   card's graph_span to the whole hours since that date and rebuilds it when the hour count grows, so the
   start stays within the hour of the date. Change the date in Home Assistant, not here.
   Options:
     entity:      the date entity (its `timestamp` attribute, else its state, is the start)
     card:        the apexcharts-card config (graph_span and span are set by this wrapper)
     span_entity: optional input_select of spans such as 3h, 24h, 7d; any other option (such as "All") means
                  since the date. Pair it with corujeira-span-card on the same input_select for the pills.
     title:       optional; sets the chart's header title to "<title> · <span>"
     since_label: optional; the span word used for "since the date" in the title (default "since the start")
   Remove this resource to revert. */
(() => {
class CorujeiraSinceCard extends HTMLElement {
  setConfig(c) {
    if (!c || !c.entity || !c.card) throw new Error("corujeira-since-card: entity and card are required");
    this._c = c;
    this._hours = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>:host { display:block; }</style><div class="inner"></div>`;
    this._card = null;
    if (this._hass) this._build();
  }
  _start() {
    const s = this._hass && this._hass.states[this._c.entity];
    if (!s) return null;
    const ts = Number(s.attributes && s.attributes.timestamp);
    const t = Number.isFinite(ts) && ts > 0 ? ts * 1000 : Date.parse(s.state);
    return Number.isFinite(t) ? t : null;
  }
  _fixed() {
    const s = this._c.span_entity && this._hass && this._hass.states[this._c.span_entity];
    const m = s && /^(\d+(?:\.\d+)?)\s*(h|d)$/i.exec(String(s.state).trim());
    return m ? { hours: parseFloat(m[1]) * (m[2].toLowerCase() === "d" ? 24 : 1), label: s.state } : null;
  }
  _spanHours() {
    const f = this._fixed();
    if (f) return f.hours;
    const t = this._start();
    return t == null ? null : Math.max(1, Math.ceil((Date.now() - t) / 3600e3));
  }
  _key() { const f = this._fixed(); return f ? `fixed:${f.hours}` : `since:${this._spanHours()}`; }
  async _build() {
    const hours = this._spanHours(), key = this._key(), f = this._fixed();
    if (this._card && key === this._hours) return;
    this._hours = key;
    const token = this._token = (this._token || 0) + 1;
    const cfg = JSON.parse(JSON.stringify(this._c.card));
    if (hours != null) { cfg.graph_span = `${hours}h`; delete cfg.span; }
    if (this._c.title) cfg.header = { ...(cfg.header || {}), title: `${this._c.title} · ${f ? f.label : (this._c.since_label || "since the start")}` };
    const h = await window.loadCardHelpers();
    if (token !== this._token) return;
    const el = h.createCardElement(cfg);
    el.addEventListener("ll-rebuild", e => { e.stopPropagation(); this._card = null; this._build(); });
    if (this._hass) el.hass = this._hass;
    const inner = this.shadowRoot.querySelector(".inner");
    inner.innerHTML = "";
    inner.appendChild(el);
    this._card = el;
  }
  set hass(h) {
    const first = !this._hass;
    this._hass = h;
    if (this._card) this._card.hass = h;
    if (first || this._key() !== this._hours) this._build();
  }
  connectedCallback() {
    clearInterval(this._tick);
    this._tick = setInterval(() => { if (this._hass && this._key() !== this._hours) this._build(); }, 300e3);
  }
  disconnectedCallback() { clearInterval(this._tick); }
  getCardSize() { return this._card && this._card.getCardSize ? this._card.getCardSize() : 5; }
  getGridOptions() { return { columns: 12, rows: "auto" }; }
}
if (!customElements.get("corujeira-since-card")) customElements.define("corujeira-since-card", CorujeiraSinceCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === "corujeira-since-card"))
  window.customCards.push({ type: "corujeira-since-card", name: "A Corujeira since", description: "Starts a chart's time axis at a date held in Home Assistant." });
})();
