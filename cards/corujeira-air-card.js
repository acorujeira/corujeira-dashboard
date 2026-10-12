/* A Corujeira air card: indoor air as one verdict in plain words, with what to do about it.
   Compact mode is one tile: a headline ("Fresh air", "Damp"), the advice for whatever is out of range, and the temperature.
   Detail mode (for a pop-up) adds one row per reading: a word for its state, a banded bar with a marker where the reading
   sits, and a reference line that says what the number means. Each row can open that reading's graph.
   Damp advice compares the water held in the air inside and outside (from their dew points), and in cold weather
   it recommends the wood burner first.
   Options:
     mode:        compact (default) | detail
     name:        default "Air in the yurt"
     icon:        default mdi:weather-windy
     humidity, co2, radon, pm25, voc, temperature: sensor entities (any can be left out)
     outdoor:     weather entity for outside temperature and humidity/dew point (optional; enables damp advice)
     stove_below: outside °C below which damp advice leads with the wood burner (default 15)
     graphs:      { humidity: "#air-hum-24h", co2: ..., ... } where tapping a row goes in detail mode (optional)
     all_graphs:  path for an "All graphs" link at the foot of the detail view (optional)
     navigate:    where tapping the compact tile goes (e.g. "#air"; default: none)
   Bands: humidity 30–60% comfortable, damp from 70%; CO2 stuffy from 1,000 ppm; radon WHO reference 100 and
   Portugal's reference level 300 Bq/m³; PM2.5 WHO 24-hour guideline 15 µg/m³; VOC on the Airthings scale
   (low under 250 ppb, high from 2,000). */
(() => {
const COL = { good: "#4FAE6A", fair: "#E9A92C", poor: "#D9573F", cold: "#4A9FD0", none: "#7f8c99" };
const fmt = (v, d = 0) => Number(v).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Each band: up to `to`, its level, word and colour. `w` is its share of the bar, so narrow but important ranges stay readable.
const METRICS = {
  humidity: { name: "Humidity", unit: "%", d: 0, min: 15, max: 90, bands: [
      { to: 30, lv: 1, word: "Dry", col: "cold", w: 1 }, { to: 60, lv: 0, word: "Comfortable", col: "good", w: 2.2 },
      { to: 70, lv: 1, word: "A bit damp", col: "fair", w: 1 }, { to: Infinity, lv: 2, word: "Damp", col: "poor", w: 1.2 }],
    ref: "Comfortable 30–60%. Mould grows if it stays above 70%." },
  co2: { name: "CO₂", unit: "ppm", d: 0, min: 400, max: 2000, bands: [
      { to: 800, lv: 0, word: "Fresh", col: "good", w: 2 }, { to: 1000, lv: 1, word: "Getting stuffy", col: "fair", w: .8 },
      { to: Infinity, lv: 2, word: "Stuffy", col: "poor", w: 1.4 }],
    ref: "Outdoor air is about 420. Stuffy and sleepy above 1,000." },
  radon: { name: "Radon", unit: "Bq/m³", d: 0, min: 0, max: 400, bands: [
      { to: 100, lv: 0, word: "Low", col: "good", w: 1.6 }, { to: 300, lv: 1, word: "Raised", col: "fair", w: 1.4 },
      { to: Infinity, lv: 2, word: "High", col: "poor", w: .8 }],
    ref: "WHO aims below 100. Portugal's reference level is 300." },
  pm25: { name: "Smoke and dust", short: "PM2.5", unit: "µg/m³", d: 0, min: 0, max: 60, bands: [
      { to: 15, lv: 0, word: "Clean", col: "good", w: 1.6 }, { to: 35, lv: 1, word: "Some smoke", col: "fair", w: 1.1 },
      { to: Infinity, lv: 2, word: "Smoky", col: "poor", w: 1 }],
    ref: "Fine particles (PM2.5). WHO daily guideline 15." },
  voc: { name: "Fumes and odours", short: "VOC", unit: "ppb", d: 0, min: 0, max: 3000, bands: [
      { to: 250, lv: 0, word: "Low", col: "good", w: 1.4 }, { to: 2000, lv: 1, word: "Some odours", col: "fair", w: 1.6 },
      { to: Infinity, lv: 2, word: "Strong", col: "poor", w: .7 }],
    ref: "Cooking, wood, paint and people raise it. Airthings counts under 250 as low." },
  temperature: { name: "Temperature", unit: "°C", d: 1, min: 8, max: 32, bands: [
      { to: 16, lv: 1, word: "Cold", col: "cold", w: 1.2 }, { to: 18, lv: 0, word: "Cool", col: "good", w: .6 },
      { to: 24, lv: 0, word: "Comfortable", col: "good", w: 1.6 }, { to: Infinity, lv: 1, word: "Warm", col: "fair", w: 1.1 }],
    ref: "Comfortable 18–24 °C." },
};
const ORDER = ["humidity", "co2", "radon", "pm25", "voc", "temperature"];

// Dew point (Magnus formula) and the water it stands for, in g/m³.
const dew = (t, rh) => { const a = 17.62, b = 243.12, g = Math.log(rh / 100) + a * t / (b + t); return b * g / (a - g); };
const water = (t, rh) => 6.112 * Math.exp(17.67 * t / (t + 243.5)) * rh * 2.1674 / (273.15 + t);

class CorujeiraAirCard extends HTMLElement {
  setConfig(c) {
    this._c = { mode: "compact", name: "Air in the yurt", icon: "mdi:weather-windy", stove_below: 15, graphs: {}, ...c };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._build();
    if (this._hass) this._render();
  }
  set hass(h) {
    const prev = this._hass, c = this._c;
    this._hass = h;
    const ids = [...ORDER.map(k => c[k]), c.outdoor].filter(Boolean);
    if (!prev || ids.some(id => prev.states[id] !== h.states[id])) this._render();
  }
  getCardSize() { return this._c && this._c.mode === "detail" ? 8 : 2; }
  getGridOptions() { return { columns: "full", rows: "auto" }; }

  _build() {
    const detail = this._c.mode === "detail";
    this.shadowRoot.innerHTML = `
      <style>
        :host { --good:${COL.good}; }
        ha-card { display:block; padding:${detail ? "14px 16px 12px" : "12px 16px 12px 12px"}; font-family:'Lato',sans-serif; color:var(--primary-text-color);
          ${detail ? "background:transparent; box-shadow:none; border:none;" : ""} }
        .head { display:flex; align-items:center; gap:12px; }
        .head.link { cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .ic { flex:none; width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          background:color-mix(in srgb, var(--lv) 26%, transparent); color:var(--lv); }
        .ic ha-icon { --mdc-icon-size:24px; }
        .txt { flex:1; min-width:0; }
        .verdict { font-size:16px; font-weight:700; line-height:1.25; }
        .advice { font-size:13px; line-height:1.4; color:var(--secondary-text-color); margin-top:2px; }
        .advice b { color:var(--primary-text-color); font-weight:600; }
        .advice div + div { margin-top:3px; }
        .temp { flex:none; text-align:right; font-size:22px; font-weight:300; line-height:1; }
        .temp small { display:block; font-size:11px; color:var(--secondary-text-color); margin-top:4px; font-weight:400; }
        .chev { flex:none; color:var(--secondary-text-color); opacity:.6; --mdc-icon-size:20px; margin-left:-4px; }
        .rows { margin-top:14px; display:flex; flex-direction:column; gap:6px; }
        .row { padding:10px 12px 11px; border-radius:18px; background:color-mix(in srgb, var(--lv) 9%, var(--card-background-color, #fff)); }
        .row.link { cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .row.link:active { transform:scale(.99); }
        .top { display:flex; align-items:baseline; gap:8px; }
        .nm { font-size:14px; font-weight:700; }
        .word { font-size:13px; font-weight:700; color:var(--lv); }
        .val { margin-left:auto; font-size:12.5px; color:var(--secondary-text-color); white-space:nowrap; }
        .bar { position:relative; display:flex; gap:2px; height:8px; margin:8px 0 6px; }
        .bar span { height:100%; border-radius:4px; opacity:.38; }
        .bar span.on { opacity:.9; }
        .mk { position:absolute; top:50%; width:14px; height:14px; margin:-7px 0 0 -7px; border-radius:50%; background:var(--card-background-color, #fff);
          border:3px solid var(--lv); box-sizing:border-box; box-shadow:0 1px 3px rgba(0,0,0,.25); }
        .ref { font-size:12px; line-height:1.35; color:var(--secondary-text-color); }
        .foot { margin-top:10px; display:flex; justify-content:center; }
        .foot button { all:unset; cursor:pointer; font-size:13px; font-weight:700; color:var(--primary-color); padding:8px 14px; border-radius:999px;
          background:color-mix(in srgb, var(--primary-color) 12%, transparent); }
        .foot button:focus-visible, .row.link:focus-visible, .head.link:focus-visible { outline:2px solid var(--primary-color); outline-offset:2px; }
      </style>
      <ha-card>
        <div class="head"><div class="ic"><ha-icon></ha-icon></div><div class="txt"><div class="verdict"></div><div class="advice"></div></div>
          <div class="temp"></div><ha-icon class="chev" icon="mdi:chevron-right" hidden></ha-icon></div>
        ${detail ? `<div class="rows"></div><div class="foot" hidden><button>All graphs</button></div>` : ""}
      </ha-card>`;
    const r = this.shadowRoot, head = r.querySelector(".head");
    r.querySelector(".ic ha-icon").setAttribute("icon", this._c.icon);
    if (!detail && this._c.navigate) {
      head.classList.add("link"); head.tabIndex = 0;
      r.querySelector(".chev").hidden = false;
      head.addEventListener("click", () => this._go(this._c.navigate));
      head.addEventListener("keydown", e => { if (e.key === "Enter") this._go(this._c.navigate); });
    }
    if (detail) {
      r.querySelector(".rows").addEventListener("click", e => {
        const row = e.target.closest(".row");
        if (row && row.dataset.go) this._go(row.dataset.go);
        else if (row && row.dataset.id) this._more(row.dataset.id);
      });
      if (this._c.all_graphs) {
        r.querySelector(".foot").hidden = false;
        r.querySelector(".foot button").addEventListener("click", () => this._go(this._c.all_graphs));
      }
    }
  }
  _go(path) {
    history.pushState(null, "", path.startsWith("#") ? location.pathname + location.search + path : path);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }
  _more(id) { this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: id } })); }

  _num(id) { const s = id && this._hass.states[id]; const v = s ? parseFloat(s.state) : NaN; return isNaN(v) ? null : v; }

  // Every configured reading with its band.
  _readings() {
    const out = {};
    ORDER.forEach(k => {
      const v = this._num(this._c[k]);
      if (v == null) return;
      const m = METRICS[k], b = m.bands.find(x => v < x.to) || m.bands[m.bands.length - 1];
      out[k] = { k, v, m, b };
    });
    return out;
  }

  // Outside air from the weather entity: temperature, and dew point (given, or worked out from humidity).
  _outside() {
    const s = this._c.outdoor && this._hass.states[this._c.outdoor];
    if (!s) return null;
    const a = s.attributes, t = parseFloat(a.temperature), rh = parseFloat(a.humidity);
    let dp = parseFloat(a.dew_point);
    if (isNaN(dp) && !isNaN(t) && !isNaN(rh)) dp = dew(t, rh);
    return isNaN(t) ? null : { t, rh: isNaN(rh) ? null : rh, dp: isNaN(dp) ? null : dp };
  }

  // What to do about the damp: the burner when it's cold, airing out only when the outside air holds less water.
  _damp(R, out) {
    const h = R.humidity, t = R.temperature;
    if (!h) return null;
    const cold = (out && out.t < this._c.stove_below) || (t && t.v < 16);
    if (cold) return "<b>Light the wood burner.</b> Warming the yurt dries it out.";
    if (!out || out.dp == null || !t) return "<b>Air it out</b> when the sun's on it.";
    const dIn = dew(t.v, h.v);
    if (out.dp <= dIn - 2) return "<b>Open up:</b> the outside air is drier.";
    const later = new Date().getHours() < 17 ? "this evening" : "once it cools";
    if (out.dp >= dIn + 1) return `<b>Keep it shut:</b> outside is wetter. Light the burner ${later}.`;
    return `Outside is just as moist, so airing won't help. <b>Light the burner ${later}.</b>`;
  }

  // One advice line per reading that is out of range, worst first.
  _advice(R, out) {
    const lines = [];
    const add = (lv, html) => lines.push({ lv, html });
    if (R.humidity && R.humidity.b.lv && R.humidity.v >= 60) add(R.humidity.b.lv, this._damp(R, out));
    if (R.humidity && R.humidity.v < 30) add(1, "<b>Dry air.</b> A pot of water on the burner helps.");
    if (R.co2 && R.co2.b.lv) add(R.co2.b.lv, "<b>Open a door or the crown</b> for ten minutes.");
    if (R.pm25 && R.pm25.b.lv) add(R.pm25.b.lv, R.pm25.b.lv === 2
      ? "<b>Smoke in the air:</b> check the burner door and flue, then air it out."
      : "<b>Some smoke or dust.</b> Air it out once the burner is drawing well.");
    if (R.radon && R.radon.b.lv) add(R.radon.b.lv, "<b>Radon is up:</b> it builds when the yurt stays shut. Air it out daily.");
    if (R.voc && R.voc.b.lv === 2) add(2, "<b>Strong fumes:</b> air it out, and check for paint, solvents or gas.");
    if (R.temperature && R.temperature.v < 16 && !(R.humidity && R.humidity.v >= 60)) add(1, "<b>Cold:</b> light the wood burner.");
    return lines.sort((a, b) => b.lv - a.lv);
  }

  _render() {
    if (!this._hass || !this.shadowRoot || !this._c) return;
    const r = this.shadowRoot, R = this._readings(), out = this._outside(), keys = Object.keys(R);
    const flagged = keys.map(k => R[k]).filter(x => x.b.lv > 0 && !(x.k === "voc" && x.b.lv < 2) && (x.k !== "temperature" || x.v < 16))
      .sort((a, b) => b.b.lv - a.b.lv);
    const worst = flagged.length ? flagged[0].b.lv : 0;
    const col = !keys.length ? COL.none : worst === 2 ? COL.poor : worst === 1 ? COL.fair : COL.good;
    const words = flagged.slice(0, 2).map((x, i) => i ? x.b.word.toLowerCase() : x.b.word);
    const verdict = !keys.length ? "No readings" : words.length ? words.join(", ") : "Fresh air";
    const lines = this._advice(R, out);
    const advice = !keys.length ? "The air sensor isn't reporting."
      : lines.length ? lines.slice(0, this._c.mode === "detail" ? 4 : 2).map(l => `<div>${l.html}</div>`).join("")
      : "Every reading is in a healthy range.";
    const head = r.querySelector(".head");
    head.style.setProperty("--lv", col);
    r.querySelector(".verdict").textContent = verdict;
    r.querySelector(".advice").innerHTML = advice;
    const t = R.temperature, h = R.humidity;
    r.querySelector(".temp").innerHTML = t && this._c.mode !== "detail" ? `${fmt(t.v, 0)}°${h ? `<small>${fmt(h.v)}% RH</small>` : ""}` : "";
    if (this._c.mode !== "detail") return;

    r.querySelector(".rows").innerHTML = ORDER.filter(k => R[k]).map(k => {
      const { v, m, b } = R[k], c = COL[b.col], tw = m.bands.reduce((s, x) => s + x.w, 0);
      // Marker position: piecewise across the bands, each band's span on the bar set by its weight.
      let pos = 0, lo = m.min;
      for (const x of m.bands) {
        const hi = Math.min(x.to, m.max), span = x.w / tw;
        if (v < x.to || x === m.bands[m.bands.length - 1]) { pos += span * Math.max(0, Math.min(1, (v - lo) / (hi - lo))); break; }
        pos += span; lo = hi;
      }
      const segs = m.bands.map(x => `<span class="${x === b ? "on" : ""}" style="flex:${x.w};background:${COL[x.col]}"></span>`).join("");
      let ref = m.ref;
      if (k === "humidity" && t && out && out.rh != null) {
        const wi = water(t.v, v), wo = water(out.t, out.rh);
        ref = `Water in the air: ${fmt(wi, 1)} g/m³ inside, ${fmt(wo, 1)} outside. ${m.ref}`;
      }
      const go = (this._c.graphs || {})[k];
      return `<div class="row link" tabindex="0" style="--lv:${c}" ${go ? `data-go="${esc(go)}"` : `data-id="${esc(this._c[k])}"`}>
        <div class="top"><span class="nm">${esc(m.name)}</span><span class="word">${esc(b.word)}</span>
          <span class="val">${fmt(v, m.d)}${m.unit === "%" ? "" : " "}${esc(m.unit)}</span></div>
        <div class="bar">${segs}<i class="mk" style="left:${(pos * 100).toFixed(1)}%"></i></div>
        <div class="ref">${esc(ref)}</div></div>`;
    }).join("");
  }
}
if (!customElements.get("corujeira-air-card")) customElements.define("corujeira-air-card", CorujeiraAirCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === "corujeira-air-card"))
  window.customCards.push({ type: "corujeira-air-card", name: "A Corujeira Air", description: "Indoor air as one plain-language verdict with advice, and banded readings for a pop-up." });
})();
