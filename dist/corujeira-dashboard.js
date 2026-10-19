/* A Corujeira dashboard cards v1.14.0. Built from cards/ by scripts/build.mjs; edit the files in cards/, not this one.
   Contains: corujeira-air-card, corujeira-fire-card, corujeira-flow-card, corujeira-forecast-card, corujeira-hoot-card, corujeira-meteogram-card, corujeira-mirror-strategy, corujeira-silo-card, corujeira-span-card, corujeira-zones-card. */
console.info("%c A CORUJEIRA %c dashboard cards v1.14.0 ", "background:#2E8B57;color:#fff;font-weight:700", "background:#E8E2D6;color:#343A40");

// ---- corujeira-air-card.js
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
  getGridOptions() { return { columns: 12, rows: "auto" }; }

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

// ---- corujeira-fire-card.js
/* A Corujeira fire tile: always-on fire risk strip for the top of the dashboard.
   Reads IPMA's daily fire risk (sensor from the IPMA integration, 1 = low ... 5 = maximum), IPMA's weather
   warning level, and satellite hotspots (geo_location entities from the GeoJSON integration fed by NASA FIRMS).
   Quiet and compact at low risk; tinted with plain advice at high risk; a red line when a hotspot is close,
   saying whether the wind is blowing from it toward the land. Options: risk, warning, wind (entity ids),
   near_km (hotspots counted, default 30), alert_km (close fire, default 5), navigate (e.g. "#fire"). */
(() => {
const LEVELS = [
  null,
  { name: "low", color: "#3DAA5C" },
  { name: "moderate", color: "#D9A400" },
  { name: "high", color: "#F07F1A" },
  { name: "very high", color: "#E0402C" },
  { name: "maximum", color: "#9B1C3F" },
];
const ADVICE = {
  3: "No outdoor fires or burning. Careful with sparks: angle grinders, brush cutters, chainsaws.",
  4: "No outdoor fires or burning. Avoid angle grinders, brush cutters and chainsaws outside. Keep a hose ready.",
  5: "No outdoor fires or burning. No spark-making tools outside. Keep hoses ready and the silo full.",
};
const WARN = { yellow: "#E5B800", orange: "#F07F1A", red: "#E0402C" };
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const rad = d => d * Math.PI / 180;
const km = (a, b, c, d) => {
  const h = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const bearing = (a, b, c, d) => {
  const y = Math.sin(rad(d - b)) * Math.cos(rad(c));
  const x = Math.cos(rad(a)) * Math.sin(rad(c)) - Math.sin(rad(a)) * Math.cos(rad(c)) * Math.cos(rad(d - b));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};
const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

class CorujeiraFireCard extends HTMLElement {
  setConfig(c) {
    this._c = { risk: "sensor.ponte_de_lima_fire_risk", warning: "sensor.ponte_de_lima_weather_alert",
      wind: "weather.forecast_home", near_km: 30, alert_km: 5, ...c };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { display:block; box-sizing:border-box; padding:10px 14px; font-family:'Lato',sans-serif; border-radius:var(--ha-card-border-radius, 18px);
          transition:background .3s; -webkit-tap-highlight-color:transparent; }
        ha-card.tap { cursor:pointer; }
        .row { display:flex; align-items:center; gap:12px; }
        .ico { width:36px; height:36px; flex:none; border-radius:50%; display:flex; align-items:center; justify-content:center; }
        .ico ha-icon { --mdc-icon-size:21px; }
        .main { flex:1 1 auto; min-width:0; }
        .title { font-size:15px; color:var(--primary-text-color); line-height:1.25; }
        .title b { font-weight:800; }
        .sub { font-size:12.5px; color:var(--secondary-text-color); line-height:1.35; margin-top:1px; }
        .meter { display:flex; gap:3px; flex:none; }
        .meter i { display:block; width:14px; height:8px; border-radius:3px; background:color-mix(in srgb, var(--primary-text-color) 10%, transparent); }
        .lines { margin:8px 0 0 48px; display:flex; flex-direction:column; gap:4px; }
        .line { display:flex; gap:6px; align-items:flex-start; font-size:13.5px; line-height:1.4; }
        .line ha-icon { --mdc-icon-size:16px; flex:none; margin-top:2px; }
        .warnpill { display:inline-block; padding:0 7px; border-radius:999px; font-size:11.5px; font-weight:700; color:#fff; margin-left:4px; vertical-align:1px; }
        @media (max-width: 480px) { .meter i { width:9px; } .lines { margin-left:0; } }
      </style>
      <ha-card><div class="row"><div class="ico"><ha-icon icon="mdi:fire"></ha-icon></div>
        <div class="main"><div class="title"></div><div class="sub"></div></div><div class="meter"></div></div>
        <div class="lines"></div></ha-card>`;
    const card = this.shadowRoot.querySelector("ha-card");
    card.classList.toggle("tap", !!this._c.navigate);
    card.addEventListener("click", () => {
      const nav = this._c.navigate;
      if (nav) {
        history.pushState(null, "", nav.startsWith("#") ? location.pathname + location.search + nav : nav);
        window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      } else if (this._c.risk) {
        this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: this._c.risk } }));
      }
    });
    this._sig = null;
    if (this._hass) this._render();
  }
  getCardSize() { return 1; }
  getGridOptions() { return { columns: "full", rows: "auto" }; }

  set hass(h) {
    this._hass = h;
    // re-render only when something this tile shows has changed
    const fires = Object.keys(h.states).filter(k => k.startsWith("geo_location.") && h.states[k].attributes.source === "geo_json_events");
    const st = k => k && h.states[k] ? h.states[k].state : "";
    const w = this._c && h.states[this._c.wind];
    const sig = [st(this._c.risk), st(this._c.warning), w && w.attributes.wind_bearing, w && w.attributes.wind_speed,
      fires.map(k => k + h.states[k].attributes.latitude + h.states[k].attributes.longitude).join()].join("|");
    if (sig !== this._sig) { this._sig = sig; this._render(); }
  }

  // hotspots: distance and direction from home, and whether the wind is blowing from them toward the land
  _fires() {
    const h = this._hass, home = h.states["zone.home"];
    if (!home) return [];
    const lat = home.attributes.latitude, lon = home.attributes.longitude;
    const w = h.states[this._c.wind], from = w && w.attributes.wind_bearing, speed = w ? +w.attributes.wind_speed || 0 : 0;
    return Object.values(h.states)
      .filter(s => s.entity_id.startsWith("geo_location.") && s.attributes.source === "geo_json_events"
        && s.attributes.latitude != null && s.attributes.longitude != null)
      .map(s => {
        const d = km(lat, lon, s.attributes.latitude, s.attributes.longitude), b = bearing(lat, lon, s.attributes.latitude, s.attributes.longitude);
        // wind_bearing is where the wind comes FROM; it carries a fire toward us when it comes from the fire's side
        const toward = from != null && speed >= 3 && angDiff(+from, b) <= 45;
        return { d, b, dir: COMPASS[Math.round(b / 45) % 8], toward };
      })
      .filter(f => f.d <= this._c.near_km)
      .sort((a, b) => a.d - b.d);
  }

  _render() {
    const h = this._hass;
    if (!h || !this.shadowRoot) return;
    const $ = s => this.shadowRoot.querySelector(s);
    const rs = h.states[this._c.risk], lvl = rs ? parseInt(rs.state, 10) : NaN;
    const L = LEVELS[lvl] || null, color = L ? L.color : "#9AA0A6";
    const fires = this._fires(), close = fires.filter(f => f.d <= this._c.alert_km);
    const alarm = close.length > 0;
    const accent = alarm ? "#E0402C" : color;

    const card = $("ha-card");
    card.style.background = (lvl >= 3 || alarm)
      ? `color-mix(in srgb, ${accent} ${alarm ? 16 : 11}%, var(--ha-card-background, var(--card-background-color, #fff)))` : "";
    card.style.border = (lvl >= 3 || alarm) ? `1.5px solid color-mix(in srgb, ${accent} 45%, transparent)` : "";
    const ico = $(".ico");
    ico.style.background = `color-mix(in srgb, ${accent} 16%, transparent)`;
    ico.querySelector("ha-icon").style.color = accent;
    ico.querySelector("ha-icon").setAttribute("icon", alarm ? "mdi:fire-alert" : "mdi:fire");

    const ws = h.states[this._c.warning], wv = ws && WARN[ws.state];
    $(".title").innerHTML = L ? `fire risk <b style="color:${color}">${L.name}</b>${wv ? `<span class="warnpill" style="background:${wv}">${esc(ws.state)} weather warning</span>` : ""}`
      : `fire risk <b>unavailable</b>`;

    const near = fires.length
      ? `${fires.length} hotspot${fires.length > 1 ? "s" : ""} within ${this._c.near_km} km, nearest ${fires[0].d < 10 ? fires[0].d.toFixed(1) : Math.round(fires[0].d)} km ${fires[0].dir}`
      : `no fires detected within ${this._c.near_km} km`;
    $(".sub").textContent = `IPMA today · ${near}`;

    $(".meter").innerHTML = [1, 2, 3, 4, 5].map(i => `<i style="${L && i <= lvl ? `background:${LEVELS[i].color}` : ""}"></i>`).join("");

    const lines = [];
    if (alarm) {
      const f = close[0];
      lines.push({ icon: "mdi:fire-alert", color: "#C62828", text: `Fire detected ${f.d.toFixed(1)} km ${f.dir}${f.toward ? ", wind blowing from it toward us. Get ready to act and check official news." : ". Wind is not blowing toward us for now."}` });
    }
    if (ADVICE[lvl]) lines.push({ icon: "mdi:alert-outline", color: "var(--primary-text-color)", text: ADVICE[lvl] });
    $(".lines").innerHTML = lines.map(l => `<div class="line" style="color:${l.color}"><ha-icon icon="${l.icon}" style="color:${l.color === "var(--primary-text-color)" ? accent : l.color}"></ha-icon><span>${esc(l.text)}</span></div>`).join("");
    $(".lines").style.display = lines.length ? "" : "none";
  }
}

if (!customElements.get("corujeira-fire-card")) customElements.define("corujeira-fire-card", CorujeiraFireCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === "corujeira-fire-card"))
  window.customCards.push({ type: "corujeira-fire-card", name: "A Corujeira fire tile", description: "IPMA fire risk, warnings and nearby satellite hotspots." });
})();

// ---- corujeira-flow-card.js
/* A Corujeira flow card v5: sources on top, hub in the middle, up to 4 loads below, wiring-diagram lines.
   With 4 loads the load circles shrink so they fit. A node with dashed: true gets a dashed ring (used for "Other").
   Scales to match the height of the card beside it in the same row. Remove this resource to revert. */
(() => {
const W = 340, H = 334, R = 40, RS = 34, HX = 170, HY = 167, TOPY = 61, BOTY = 273, RC = 8, ENTRY = 20, PAD = 8;
const COLS = { 1: [170], 2: [55, 285], 3: [55, 170, 285], 4: [42, 127, 213, 298] };
const ENTRY4 = [-24, -8, 8, 24], BY4 = [-8, 8, 8, -8];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const up = n => n && (n.parentElement || (n.getRootNode && n.getRootNode().host) || null);

// Orthogonal path with rounded corners. Sources run node -> hub top; loads run hub bottom -> node.
function wire(n) {
  const x = n.x, r = n.r, dx = n.dx, ex = HX + dx, off = Math.sqrt(R * R - dx * dx), byo = n.byo || 0;
  if (n.role === "source") {
    const sy = TOPY + r, ey = HY - off, by = (sy + HY - R) / 2 + byo;
    if (x === ex) return `M${x},${sy} V${ey}`;
    const s = Math.sign(ex - x);
    return `M${x},${sy} V${by - RC} Q${x},${by} ${x + s * RC},${by} H${ex - s * RC} Q${ex},${by} ${ex},${by + RC} V${ey}`;
  }
  const sy = HY + off, ey = BOTY - r, by = (HY + R + ey) / 2 + byo;
  if (x === ex) return `M${ex},${sy} V${ey}`;
  const s = Math.sign(x - ex);
  return `M${ex},${sy} V${by - RC} Q${ex},${by} ${ex + s * RC},${by} H${x - s * RC} Q${x},${by} ${x},${by + RC} V${ey}`;
}

class CorujeiraFlowCard extends HTMLElement {
  setConfig(c) {
    if (!c || !c.hub || !c.hub.entity) throw new Error("corujeira-flow-card: hub.entity is required");
    this._c = { watt_threshold: 1000, kw_decimals: 1, sources: [], loads: [], match_neighbour_height: true, max_scale: 1.3, ...c };
    this._built = false;
    this._tpl = {};
    this._dur = {};
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }
  getCardSize() { return 6; }
  getGridOptions() { return { columns: 12, rows: "auto", min_rows: 5 }; }

  set hass(h) {
    this._hass = h;
    if (!this._built) this._build();
    if (!this._subscribed && this.isConnected) this._subscribe();
    this._update();
  }
  connectedCallback() {
    if (this._hass && !this._subscribed) this._subscribe();
    this._startFit();
  }
  disconnectedCallback() {
    (this._unsubs || []).forEach(p => Promise.resolve(p).then(u => typeof u === "function" && u()).catch(() => {}));
    this._unsubs = [];
    this._subscribed = false;
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    clearTimeout(this._fitTimer);
  }

  _nodes() {
    const c = this._c, out = [];
    const src = c.sources.slice(0, 3), lds = c.loads.slice(0, 4);
    const sx = COLS[src.length] || COLS[3], lx = COLS[lds.length] || COLS[3];
    const four = lds.length === 4;
    const edx = x => x < HX ? -ENTRY : x > HX ? ENTRY : 0;
    src.forEach((n, i) => out.push({ ...n, role: "source", key: "s" + i, x: sx[i], y: TOPY, r: R, dx: edx(sx[i]) }));
    lds.forEach((n, i) => out.push({ ...n, role: "load", key: "l" + i, x: lx[i], y: BOTY,
      r: four ? RS : R, dx: four ? ENTRY4[i] : edx(lx[i]), byo: four ? BY4[i] : 0 }));
    return out;
  }

  _subscribe() {
    const conn = this._hass && this._hass.connection;
    if (!conn) return;
    this._subscribed = true;
    this._unsubs = [];
    [{ ...this._c.hub, key: "hub" }, ...this._nodes()].forEach(n => {
      const t = n.secondary && n.secondary.template;
      if (!t) return;
      this._unsubs.push(conn.subscribeMessage(msg => {
        if (msg && "result" in msg) { this._tpl[n.key] = String(msg.result); this._update(); }
      }, { type: "render_template", template: t }).catch(() => {}));
    });
  }

  // ---- sizing: scale the fixed design to the card width, and to the neighbour's height when side by side
  _gridCell() {
    let n = this;
    for (let i = 0; i < 8 && n; i++) {
      if (n.tagName === "HUI-CARD") return up(n);
      n = up(n);
    }
    return null;
  }
  _neighbourHeight() {
    if (!this._c.match_neighbour_height) return 0;
    const cell = this._gridCell();
    if (!cell || !cell.parentElement) return 0;
    const me = cell.getBoundingClientRect();
    let best = 0;
    for (const sib of cell.parentElement.children) {
      if (sib === cell || !sib.offsetHeight) continue;
      const r = sib.getBoundingClientRect();
      if (Math.abs(r.top - me.top) < 6 && r.left > me.left) best = Math.max(best, r.height);
    }
    return best;
  }
  _startFit() {
    if (this._ro || !this._built) return;
    this._ro = new ResizeObserver(() => this._queueFit());
    this._ro.observe(this.shadowRoot.querySelector("ha-card"));
    const cell = this._gridCell();
    if (cell && cell.parentElement) for (const sib of cell.parentElement.children) if (sib !== cell) this._ro.observe(sib);
    this._queueFit();
    setTimeout(() => this._queueFit(), 800);
    setTimeout(() => this._queueFit(), 2500);
  }
  _queueFit() { clearTimeout(this._fitTimer); this._fitTimer = setTimeout(() => this._fit(), 30); }
  _fit() {
    const card = this.shadowRoot.querySelector("ha-card"), stage = this.shadowRoot.querySelector(".stage"), wrap = this.shadowRoot.querySelector(".wrap");
    if (!card || !stage) return;
    const availW = card.clientWidth - 2 * PAD;
    if (availW <= 0) return;
    const target = this._neighbourHeight();
    let s = Math.min(availW / W, this._c.max_scale);
    if (target > 0) s = Math.min(s, (target - 2 * PAD) / H);
    s = Math.max(0.6, s);
    stage.style.width = W * s + "px";
    stage.style.height = H * s + "px";
    wrap.style.transform = `scale(${s})`;
    card.style.height = target > 0 ? target + "px" : "";
  }

  _build() {
    const c = this._c, nodes = this._nodes();
    this._uid = Math.random().toString(36).slice(2, 8);
    const lines = nodes.map(n => `
      <path id="p-${this._uid}-${n.key}" class="line" data-k="${n.key}" d="${wire(n)}" stroke="${esc(n.color || "#999")}"/>
      <circle class="dot" data-k="${n.key}" r="3" fill="${esc(n.color || "#999")}">
        <animateMotion dur="2s" repeatCount="indefinite" calcMode="linear" keyPoints="0;1" keyTimes="0;1">
          <mpath href="#p-${this._uid}-${n.key}"/>
        </animateMotion>
      </circle>`).join("");
    const glyph = n => n.icon_mask
      ? `<div class="mask" style="background:${esc(n.icon_color || "var(--primary-text-color)")};-webkit-mask:url('${esc(n.icon_mask)}') center/contain no-repeat;mask:url('${esc(n.icon_mask)}') center/contain no-repeat"></div>`
      : `<ha-icon class="ic" icon="${esc(n.icon || "mdi:flash")}" style="color:${esc(n.icon_color || "var(--primary-text-color)")}"></ha-icon>`;
    const nodeHtml = (n, cls) => {
      const r = n.r || R;
      const extra = (r < R ? " sm" : "") + (n.dashed ? " dashed" : "");
      return `
      <div class="node ${cls}${extra}" data-k="${n.key}" role="button" tabindex="0" style="left:${n.x - r}px;top:${n.y - r}px;width:${2 * r}px;height:${2 * r}px;--c:${esc(n.color || "var(--primary-text-color)")}">
        <div class="top"><ha-icon class="ti"></ha-icon><span class="tt"></span></div>
        ${glyph(n)}
        <div class="val"></div>
      </div>`;
    };
    const label = n => n.name ? `<div class="name ${n.role}" style="left:${n.x}px;top:${n.role === "source" ? n.y - n.r - 5 : n.y + n.r + 5}px">${esc(n.name)}</div>` : "";
    const hub = { ...c.hub, key: "hub", x: HX, y: HY, r: R };
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { padding:${PAD}px; box-sizing:border-box; display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .stage { position:relative; width:${W}px; height:${H}px; flex:none; }
        .wrap { position:absolute; left:0; top:0; width:${W}px; height:${H}px; transform-origin:0 0; font-family:'Lato',sans-serif; }
        svg { position:absolute; inset:0; width:${W}px; height:${H}px; overflow:visible; }
        .line { fill:none; stroke-width:1.5; opacity:.95; transition:opacity .4s; }
        .line.idle { opacity:.2; }
        .dot.idle { display:none; }
        .node { --bg: var(--card-background-color, #fff); position:absolute; width:${2 * R}px; height:${2 * R}px; box-sizing:border-box; border-radius:50%;
          border:2.5px solid var(--c); background: color-mix(in srgb, var(--c) 7%, var(--bg));
          box-shadow: 0 1px 3px color-mix(in srgb, var(--c) 30%, transparent);
          display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; padding-top:3px;
          cursor:pointer; color:var(--primary-text-color); -webkit-tap-highlight-color:transparent; outline:none;
          transition: background .15s, transform .12s, box-shadow .15s; }
        .node.hub { border-width:3px; }
        .node.dashed { border-style:dashed; }
        @media (hover:hover) { .node:hover { background: color-mix(in srgb, var(--c) 20%, var(--bg)); box-shadow: 0 2px 8px color-mix(in srgb, var(--c) 45%, transparent); } }
        .node:active { transform: scale(.94); background: color-mix(in srgb, var(--c) 26%, var(--bg)); }
        .node:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 45%, transparent); }
        .top { display:flex; align-items:center; gap:2px; font-size:10px; line-height:1.1; white-space:nowrap; min-height:12px; max-width:60px; }
        .ti { --mdc-icon-size:10px; flex:none; }
        .ti[hidden] { display:none; }
        .ic { --mdc-icon-size:22px; }
        .mask { width:21px; height:27px; margin:1px 0; }
        .val { font-size:11.5px; line-height:1.1; white-space:nowrap; }
        .val.batt { color: var(--c); }
        .node.sm { padding-top:2px; }
        .node.sm .top { font-size:9.5px; max-width:54px; min-height:11px; }
        .node.sm .ti { --mdc-icon-size:9px; }
        .node.sm .ic { --mdc-icon-size:19px; }
        .node.sm .mask { width:18px; height:23px; }
        .node.sm .val { font-size:11px; }
        .name { position:absolute; transform:translate(-50%,-100%); font-size:12px; letter-spacing:.02em; color:var(--secondary-text-color); white-space:nowrap; }
        .name.load { transform:translate(-50%,0); }
      </style>
      <ha-card><div class="stage"><div class="wrap">
        <svg viewBox="0 0 ${W} ${H}">${lines}</svg>
        ${nodes.map(label).join("")}
        ${nodeHtml(hub, "hub")}
        ${nodes.map(n => nodeHtml(n, n.role)).join("")}
      </div></div></ha-card>`;
    this._byKey = { hub };
    nodes.forEach(n => this._byKey[n.key] = n);
    this.shadowRoot.querySelectorAll(".node").forEach(el => {
      const go = () => this._tap(this._byKey[el.dataset.k]);
      el.addEventListener("click", go);
      el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    this._built = true;
    if (this.isConnected) this._startFit();
  }

  _num(id) {
    const s = id && this._hass.states[id];
    return s ? parseFloat(s.state) : NaN;
  }
  _fmtW(v) {
    if (!isFinite(v)) return "—";
    const a = Math.abs(v);
    return a >= this._c.watt_threshold ? (a / 1000).toFixed(this._c.kw_decimals) + " kW" : Math.round(a) + " W";
  }
  _secondary(n) {
    const s = n.secondary;
    if (!s) return "";
    if (s.template) return this._tpl[n.key] ?? "";
    const v = this._num(s.entity);
    if (!isFinite(v)) return "—";
    const unit = s.unit ?? (this._hass.states[s.entity].attributes.unit_of_measurement || "");
    if (s.auto_wh && unit === "kWh" && Math.abs(v) < 1) return Math.round(v * 1000) + " Wh";
    return v.toFixed(s.decimals ?? 1) + (unit ? " " + unit : "");
  }

  _update() {
    if (!this._built || !this._hass) return;
    const root = this.shadowRoot;
    Object.values(this._byKey).forEach(n => {
      const el = root.querySelector(`.node[data-k="${n.key}"]`);
      if (!el) return;
      let v = this._num(n.entity);
      if (n.invert) v = -v;
      const topText = el.querySelector(".tt"), topIcon = el.querySelector(".ti"), val = el.querySelector(".val");
      if (n.soc_entity) {
        const soc = this._num(n.soc_entity);
        topText.textContent = isFinite(soc) ? Math.round(soc) + " %" : "—";
        topIcon.hidden = true;
        const lvl = isFinite(soc) ? Math.min(100, Math.max(0, Math.round(soc / 10) * 10)) : 50;
        const ic = el.querySelector(".ic");
        if (ic) ic.setAttribute("icon", lvl >= 100 ? "mdi:battery" : lvl <= 0 ? "mdi:battery-outline" : "mdi:battery-" + lvl);
        val.classList.add("batt");
        val.textContent = (isFinite(v) && Math.abs(v) >= 1 ? (v > 0 ? "↑ " : "↓ ") : "") + this._fmtW(v);
      } else {
        const sec = this._secondary(n);
        topText.textContent = sec;
        const ic = n.secondary && n.secondary.icon;
        if (ic && sec) { topIcon.setAttribute("icon", ic); topIcon.hidden = false; } else topIcon.hidden = true;
        val.textContent = this._fmtW(v);
      }
      if (n.key === "hub") return;
      // Paths run source->hub and hub->load, so keyPoints "0;1" is the normal direction.
      let flow = 0, forward = true;
      if (isFinite(v)) {
        if (n.role === "source") { if (v >= 0) flow = v; else if (n.bidirectional) { flow = -v; forward = false; } }
        else flow = Math.max(0, v);
      }
      const line = root.querySelector(`.line[data-k="${n.key}"]`), dot = root.querySelector(`.dot[data-k="${n.key}"]`);
      const active = flow >= 1;
      line.classList.toggle("idle", !active);
      dot.classList.toggle("idle", !active);
      if (active) {
        const dur = Math.max(0.9, Math.round((4.6 - 1.25 * Math.log10(flow)) * 10) / 10) + "s";
        const kp = forward ? "0;1" : "1;0";
        const anim = dot.querySelector("animateMotion");
        if (this._dur[n.key] !== dur + kp) {
          anim.setAttribute("dur", dur);
          anim.setAttribute("keyPoints", kp);
          this._dur[n.key] = dur + kp;
        }
      }
    });
  }

  _tap(n) {
    if (!n) return;
    const path = n.navigate;
    if (path) {
      const url = path.startsWith("#") ? location.pathname + location.search + path : path;
      history.pushState(null, "", url);
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      return;
    }
    this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: n.entity } }));
  }
}

if (!customElements.get("corujeira-flow-card")) customElements.define("corujeira-flow-card", CorujeiraFlowCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === "corujeira-flow-card"))
  window.customCards.push({ type: "corujeira-flow-card", name: "A Corujeira flow", description: "Sources on top, hub in the middle, up to 4 loads below." });
})();

// ---- corujeira-forecast-card.js
/* A Corujeira forecast card: the next 12 hours (2-hourly) above a 5-day forecast, in one compact tile.
   Fills whatever height the grid gives it. Tap opens `navigate` (e.g. "#weather") if set, else the weather entity.
   Remove this resource to revert. */
(() => {
const ICON = { "clear-night": "mdi:weather-night", cloudy: "mdi:weather-cloudy", exceptional: "mdi:alert-circle-outline", fog: "mdi:weather-fog",
  hail: "mdi:weather-hail", lightning: "mdi:weather-lightning", "lightning-rainy": "mdi:weather-lightning-rainy", partlycloudy: "mdi:weather-partly-cloudy",
  pouring: "mdi:weather-pouring", rainy: "mdi:weather-rainy", snowy: "mdi:weather-snowy", "snowy-rainy": "mdi:weather-snowy-rainy",
  sunny: "mdi:weather-sunny", windy: "mdi:weather-windy", "windy-variant": "mdi:weather-windy-variant" };
const COLOR = { sunny: "#E9A92C", "clear-night": "#7C88A6", partlycloudy: "#C9A24D", cloudy: "#9AA5B1", fog: "#A0A7AE", hail: "#8FB8D6",
  rainy: "#4A9FD0", pouring: "#3F86B8", lightning: "#8E6BBF", "lightning-rainy": "#8E6BBF", snowy: "#8FB8D6", "snowy-rainy": "#8FB8D6",
  windy: "#7F8C99", "windy-variant": "#7F8C99", exceptional: "#D9573F" };
const NIGHT_COLOR = "#7C88A6";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

class CorujeiraForecastCard extends HTMLElement {
  setConfig(c) {
    if (!c || !c.entity) throw new Error("corujeira-forecast-card: entity is required");
    this._c = { hours: 12, step: 2, days: 5, ...c };
    this._fc = {};
    this._key = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._built = false;
    this._unsubscribe();
  }
  getCardSize() { return 3; }
  getGridOptions() { return { columns: 12, rows: 3, min_rows: 2 }; }

  set hass(h) {
    this._hass = h;
    if (!this._built) this._build();
    if (!this._subs && this.isConnected) this._subscribe();
    const s = h.states[this._c.entity];
    const key = (s ? s.last_updated : "") + "|" + Math.floor(Date.now() / 600000);
    if (key !== this._key) { this._key = key; this._render(); }
  }
  connectedCallback() { if (this._hass && !this._subs) this._subscribe(); }
  disconnectedCallback() { this._unsubscribe(); }

  _subscribe() {
    const conn = this._hass && this._hass.connection;
    if (!conn) return;
    this._subs = ["hourly", "daily"].map(t => conn.subscribeMessage(m => {
      this._fc[t] = (m && m.forecast) || [];
      this._render();
    }, { type: "weather/subscribe_forecast", forecast_type: t, entity_id: this._c.entity }).catch(() => {}));
  }
  _unsubscribe() {
    (this._subs || []).forEach(p => Promise.resolve(p).then(u => typeof u === "function" && u()).catch(() => {}));
    this._subs = null;
  }

  _build() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; height:100%; }
        ha-card { height:100%; box-sizing:border-box; padding:8px 10px; display:flex; flex-direction:column; justify-content:space-evenly;
          font-family:'Lato',sans-serif; cursor:pointer; overflow:hidden; -webkit-tap-highlight-color:transparent; }
        .row { display:grid; text-align:center; align-items:start; }
        .slot { display:flex; flex-direction:column; align-items:center; gap:1px; min-width:0; }
        .lbl { font-size:11.5px; line-height:1.2; color:var(--secondary-text-color); white-space:nowrap; }
        .lbl.now { color:var(--primary-text-color); font-weight:700; }
        .day .lbl { font-size:12.5px; font-weight:700; }
        ha-icon { --mdc-icon-size:21px; margin:1px 0; }
        .day ha-icon { --mdc-icon-size:25px; }
        .tmp { font-size:14px; line-height:1.2; color:var(--primary-text-color); white-space:nowrap; }
        .lo { color:var(--secondary-text-color); font-size:12.5px; margin-left:4px; }
        .rain { font-size:10.5px; line-height:1.2; color:#4A9FD0; min-height:12px; white-space:nowrap; }
        .rule { height:1px; background:rgba(52,58,64,0.15); margin:0 4px; flex:none; }
        .empty { text-align:center; color:var(--secondary-text-color); font-size:13px; }
      </style>
      <ha-card><div class="empty">Loading forecast…</div></ha-card>`;
    this.shadowRoot.querySelector("ha-card").addEventListener("click", () => {
      const path = this._c.navigate;
      if (path) {
        history.pushState(null, "", path.startsWith("#") ? location.pathname + location.search + path : path);
        window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
        return;
      }
      this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: this._c.entity } }));
    });
    this._built = true;
  }

  // Sunrise and sunset as minutes of the day, from sun.sun; falls back to 07:00 / 19:00.
  _sunWindow() {
    const s = this._hass && this._hass.states["sun.sun"];
    const mins = iso => { const d = new Date(iso); return isNaN(d) ? null : d.getHours() * 60 + d.getMinutes(); };
    const rise = s && mins(s.attributes.next_rising), set = s && mins(s.attributes.next_setting);
    return [rise ?? 420, set ?? 1140];
  }
  _icon(cond, night) {
    if (night && cond === "partlycloudy") return ["mdi:weather-night-partly-cloudy", NIGHT_COLOR];
    if (!night && cond === "clear-night") cond = "sunny";
    return [ICON[cond] || "mdi:weather-cloudy", COLOR[cond] || "#9AA5B1"];
  }
  _mm(p) { return p >= 1 ? Math.round(p) + " mm" : p >= 0.1 ? p.toFixed(1) + " mm" : ""; }

  _render() {
    if (!this._built || !this._hass) return;
    const card = this.shadowRoot.querySelector("ha-card");
    const hourly = this._fc.hourly, daily = this._fc.daily;
    if (!hourly && !daily) return;
    const now = Date.now(), lang = (this._hass.locale && this._hass.locale.language) || this._hass.language || "en";
    const [rise, set] = this._sunWindow();
    let html = "";

    if (hourly && hourly.length) {
      const upcoming = hourly.filter(f => new Date(f.datetime).getTime() > now - 3600e3);
      const n = Math.floor(this._c.hours / this._c.step) + 1;
      const slots = [];
      for (let i = 0; i < upcoming.length && slots.length < n; i += this._c.step) slots.push(upcoming[i]);
      const anyRain = slots.some(f => (f.precipitation || 0) >= 0.1);
      html += `<div class="row" style="grid-template-columns:repeat(${slots.length},1fr)">` + slots.map((f, i) => {
        const d = new Date(f.datetime), m = d.getHours() * 60 + d.getMinutes();
        const isNow = i === 0 && d.getTime() <= now + 1800e3;
        const [ic, col] = this._icon(f.condition, m < rise || m >= set);
        return `<div class="slot">
          <div class="lbl${isNow ? " now" : ""}">${isNow ? "Now" : String(d.getHours()).padStart(2, "0")}</div>
          <ha-icon icon="${ic}" style="color:${col}"></ha-icon>
          <div class="tmp">${Math.round(f.temperature)}°</div>
          ${anyRain ? `<div class="rain">${this._mm(f.precipitation || 0)}</div>` : ""}
        </div>`;
      }).join("") + `</div>`;
    }

    if (daily && daily.length) {
      if (html) html += `<div class="rule"></div>`;
      const today = new Date().toDateString();
      const days = daily.slice(0, this._c.days);
      const anyRain = days.some(f => (f.precipitation || 0) >= 0.5);
      html += `<div class="row" style="grid-template-columns:repeat(${days.length},1fr)">` + days.map(f => {
        const d = new Date(f.datetime);
        const label = d.toDateString() === today ? "Today" : d.toLocaleDateString(lang, { weekday: "short" });
        const [ic, col] = this._icon(f.condition, false);
        const lo = f.templow != null ? `<span class="lo">${Math.round(f.templow)}°</span>` : "";
        return `<div class="slot day">
          <div class="lbl">${esc(label)}</div>
          <ha-icon icon="${ic}" style="color:${col}"></ha-icon>
          <div class="tmp">${Math.round(f.temperature)}°${lo}</div>
          ${anyRain ? `<div class="rain">${(f.precipitation || 0) >= 0.5 ? this._mm(f.precipitation) : ""}</div>` : ""}
        </div>`;
      }).join("") + `</div>`;
    }
    card.innerHTML = html || `<div class="empty">No forecast available</div>`;
  }
}

if (!customElements.get("corujeira-forecast-card")) customElements.define("corujeira-forecast-card", CorujeiraForecastCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === "corujeira-forecast-card"))
  window.customCards.push({ type: "corujeira-forecast-card", name: "A Corujeira forecast", description: "Next 12 hours above a 5-day forecast, in one compact tile." });
})();

// ---- corujeira-hoot-card.js
/* A Corujeira Hoot card: a land speaker with a speech bubble of what the land needs. Two speakers:
   Hoot the land wizard (an owl in a wizard's hat) and Nimbu the land cat (black, fluffy, meows). Weather advice (frost, rain, wind, heat, power, water, planting, mushrooms) comes
   from the meteogram card, which publishes it on the page and keeps the last set in localStorage; fire
   advice comes from Vigia's sensors. Each line gets a small icon you can recolour.
   Options: speaker ("hoot" or "nimbu", default hoot), swap (tap the speaker to swap between Hoot and Nimbu,
   remembered per device; default on unless navigate is set), title / subtitle (override the configured
   speaker's name, defaults "Hoot" / "Land wizard" and "Nimbu" / "Land cat"), max (lines shown, default 6),
   fire (fire lines, default true), burn_window (low-risk work window nudge May to Oct, default true),
   fire_risk / fire_risk_tomorrow / alert_level / fires_nearby (entity ids, default Vigia's),
   colors (per kind: mushroom, plant, fire, frost, rain, wind, heat, power, water),
   navigate (tapping Hoot opens e.g. "#weather"), stale_hours (drop weather advice older than this, default 18),
   compact (a short greeting, then one colour-coded keyword chip per line with a few words of detail, e.g.
   "Foraging  porcini and chanterelles"; details: false leaves the chips alone; with navigate set, tapping
   anywhere on the card opens the full advice, e.g. a pop-up holding a full Hoot card),
   nearest_fire (sensor with distance and direction for the heat spot detail, default Vigia's).
   Needs a corujeira-meteogram-card somewhere in the dashboard (advice: false hides its own lines). */
(() => {
const KINDS = {
  mushroom: "#A0673A", plant: "#2E7D4F", fire: "#D9772B", frost: "#3D9BC9", rain: "#2A6FB0",
  wind: "#5E665B", heat: "#D9573F", power: "#B98A16", water: "#2F8F9D",
};
// 24px line icons drawn with currentColor, so a colour on the wrapper recolours them
const ICON = {
  mushroom: `<path d="M3.5 12.2C3.5 7 7.3 3.5 12 3.5s8.5 3.5 8.5 8.7z"/><path d="M9.3 12.2v6.3a2.7 2.7 0 0 0 5.4 0v-6.3"/><circle cx="9" cy="8.3" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.6" cy="6.9" r="1.1" fill="currentColor" stroke="none"/><circle cx="16.2" cy="10" r=".9" fill="currentColor" stroke="none"/>`,
  plant: `<path d="M12 21v-9"/><path d="M12 13.5C12 9.2 8.6 7 4.5 7c0 4.2 3.2 6.5 7.5 6.5z"/><path d="M12 11.5c0-4.6 3.4-7 7.5-7 0 4.6-3.2 7-7.5 7z"/><path d="M7.5 21h9"/>`,
  fire: `<path d="M12 21.5c-3.9 0-6.8-2.7-6.8-6.5 0-3.6 2.5-5.6 3.9-8.4.4 2 1.4 3.1 2.5 3.6.2-3.4 1.8-5.9 4.3-7.7-.3 3.3 3.4 6 3.4 11.1 0 4.7-3.2 7.9-7.3 7.9z"/><path d="M12 21.5c-1.8 0-3.1-1.2-3.1-3 0-1.9 1.5-2.9 2.3-4.4.9 1.7 3.8 2.6 3.8 4.6 0 1.6-1.2 2.8-3 2.8z"/>`,
  frost: `<path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5"/><path d="M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5M4.2 10.7l3.4-.9-.9-3.4M19.8 13.3l-3.4.9.9 3.4M4.2 13.3l3.4.9-.9 3.4M19.8 10.7l-3.4-.9.9-3.4"/>`,
  rain: `<path d="M12 3.5c3 4.1 6 7.3 6 11a6 6 0 0 1-12 0c0-3.7 3-6.9 6-11z"/><path d="M9.2 15.2a2.9 2.9 0 0 0 2.6 2.6"/>`,
  wind: `<path d="M3 8.5h10.5a3 3 0 1 0-3-3"/><path d="M3 12.5h15a3 3 0 1 1-3 3"/><path d="M3 16.5h7"/>`,
  heat: `<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>`,
  power: `<path d="M13.2 2.5 5 13.5h6.2l-1.4 8L18.5 10h-6.3z"/>`,
  water: `<path d="M5 8.5h9.5a3.5 3.5 0 0 1 0 7H13"/><path d="M5 5.5v6"/><path d="M13 15.5c1.2 1.6 2 2.7 2 3.6a2 2 0 0 1-4 0c0-.9.8-2 2-3.6z"/>`,
};
const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ICON.plant}</svg>`;
// Hoot: round owl, cream face and belly, a green wizard's hat with a gold star
const OWL = `<svg class="owl" viewBox="0 0 64 74" aria-hidden="true">
  <ellipse cx="32" cy="71" rx="15" ry="2.2" fill="rgba(52,58,64,.14)"/>
  <ellipse cx="32" cy="47" rx="22" ry="23" fill="#8A6A4F"/>
  <path d="M10.6 46c-2.6 6 .4 13.6 6 16.4-1.6-6-1.4-11 1-15.6z" fill="#6F533D"/>
  <path d="M53.4 46c2.6 6-.4 13.6-6 16.4 1.6-6 1.4-11-1-15.6z" fill="#6F533D"/>
  <ellipse cx="32" cy="56" rx="13" ry="12.5" fill="#EADCC3"/>
  <path d="M26.5 52.5l2 1.8 2-1.8M33.5 52.5l2 1.8 2-1.8M30 57.5l2 1.8 2-1.8M26.5 62l2 1.6 2-1.6M33.5 62l2 1.6 2-1.6" fill="none" stroke="#C9B48F" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="23.5" cy="40" r="9.2" fill="#F5EDDE"/><circle cx="40.5" cy="40" r="9.2" fill="#F5EDDE"/>
  <g class="eyes"><circle cx="24.3" cy="40.6" r="4.6" fill="#2B2B2B"/><circle cx="39.7" cy="40.6" r="4.6" fill="#2B2B2B"/>
  <circle cx="25.8" cy="39" r="1.5" fill="#fff"/><circle cx="41.2" cy="39" r="1.5" fill="#fff"/></g>
  <g class="lids"><circle cx="24.3" cy="40.6" r="5.2" fill="#F5EDDE"/><circle cx="39.7" cy="40.6" r="5.2" fill="#F5EDDE"/></g>
  <path d="M29.2 46.4h5.6L32 51.2z" fill="#E8913A"/>
  <path d="M26 69.5l1.4-2.4 1.4 2.4M35.2 69.5l1.4-2.4 1.4 2.4" fill="none" stroke="#E8913A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M15.5 27.5 33.5 1.5c1.2 4 4.6 7.4 8.4 9.2L48.5 27.5z" fill="#2E5E44"/>
  <path d="M21.4 21.3c6 1.5 15.5 1.5 22.4-.6" fill="none" stroke="#D4A72C" stroke-width="1.8" stroke-linecap="round"/>
  <ellipse cx="32" cy="27.5" rx="20" ry="3.6" fill="#244D37"/>
  <path d="M30 12.2l1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.2 1.2.4-2.5-1.8-1.7 2.5-.3z" fill="#D4A72C"/>
</svg>`;
// Fluffy outline: points on an ellipse with a swept tuft between each pair, seeded so it never changes.
// floor flattens the bottom (a cat sitting on the ground).
const fluff = (cx, cy, rx, ry, n, d, seed, floor) => {
  let s = seed;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const at = (a, f) => { const y = cy + ry * f * Math.sin(a); return [cx + rx * f * Math.cos(a), floor != null ? Math.min(y, floor) : y]; };
  const f = v => v.toFixed(2), step = 2 * Math.PI / n, a0 = -Math.PI / 2;
  let p = at(a0, 1), out = `M${f(p[0])} ${f(p[1])}`;
  for (let i = 0; i < n; i++) {
    const a = a0 + i * step, t = at(a + step * (.55 + rnd() * .15), 1 + d * (.6 + rnd() * .8));
    const c1 = at(a + step * .3, 1.02), c2 = at(a + step * .85, .99), e = at(a + step, 1 - rnd() * d * .2);
    out += `Q${f(c1[0])} ${f(c1[1])} ${f(t[0])} ${f(t[1])}Q${f(c2[0])} ${f(c2[1])} ${f(e[0])} ${f(e[1])}`;
  }
  return out + "Z";
};
// Nimbu: a black fluffy cat with gold eyes, the resident Gato Shaman. He blinks, swishes his tail and
// meows now and then (tap him to make him meow, or to swap with Hoot when swap is on).
const FUR = "#262321";
const CAT = `<svg class="cat" viewBox="0 0 64 74" aria-hidden="true">
  <ellipse cx="32" cy="71" rx="17" ry="2.2" fill="rgba(52,58,64,.16)"/>
  <g class="tail"><path d="M20 66c-7 1-13-3-13.5-10.5-.4-5.6 3.6-9.4 1.6-14" fill="none" stroke="${FUR}" stroke-width="7" stroke-linecap="round"/>
    <path class="fur" d="${fluff(8, 41, 4.2, 4.6, 9, .26, 7)}" fill="${FUR}"/></g>
  <path class="fur" d="${fluff(32, 55, 17.5, 15.5, 23, .085, 3, 70.2)}" fill="${FUR}"/>
  <path d="${fluff(32, 53.5, 7, 8, 11, .14, 11)}" fill="#35312E"/>
  <ellipse cx="26.2" cy="69" rx="4.3" ry="2.5" fill="#2E2A27"/><ellipse cx="37.8" cy="69" rx="4.3" ry="2.5" fill="#2E2A27"/>
  <path d="M25 68.6v1.4M27.4 68.6v1.4M36.6 68.6v1.4M39 68.6v1.4" stroke="#4A4541" stroke-width=".6" stroke-linecap="round"/>
  <g class="head">
    <g class="ear l"><path class="fur" d="M17.6 31 19.4 11.8 30.2 22.6z" fill="${FUR}" stroke-linejoin="round"/><path d="M20.4 27.4 21.2 16.6 27.6 23z" fill="#5C4046"/>
      <path d="M21.4 21.5l2 2.6M22 18.8l1.4 3" stroke="#6E6862" stroke-width=".6" stroke-linecap="round"/></g>
    <g class="ear r"><path class="fur" d="M46.4 31 44.6 11.8 33.8 22.6z" fill="${FUR}" stroke-linejoin="round"/><path d="M43.6 27.4 42.8 16.6 36.4 23z" fill="#5C4046"/>
      <path d="M42.6 21.5l-2 2.6M42 18.8l-1.4 3" stroke="#6E6862" stroke-width=".6" stroke-linecap="round"/></g>
    <path class="fur" d="${fluff(32, 34.5, 15.6, 13, 21, .1, 5)}" fill="${FUR}"/>
    <g class="eyes"><ellipse cx="25.6" cy="34" rx="3.6" ry="3.1" fill="#D9B93C"/><ellipse cx="38.4" cy="34" rx="3.6" ry="3.1" fill="#D9B93C"/>
      <ellipse class="pupil" cx="25.8" cy="34" rx="1.1" ry="2.7" fill="#111"/><ellipse class="pupil" cx="38.2" cy="34" rx="1.1" ry="2.7" fill="#111"/>
      <circle cx="26.9" cy="32.7" r=".8" fill="#fff"/><circle cx="39.5" cy="32.7" r=".8" fill="#fff"/></g>
    <g class="lids"><ellipse cx="25.6" cy="34" rx="4.1" ry="3.6" fill="${FUR}"/><ellipse cx="38.4" cy="34" rx="4.1" ry="3.6" fill="${FUR}"/></g>
    <path d="M30.5 38.6h3l-1.5 1.7z" fill="#B98088"/>
    <path class="shut" d="M32 40.3v.9M29.8 41.2c.8.8 1.6.8 2.2 0 .6.8 1.4.8 2.2 0" fill="none" stroke="#8A847C" stroke-width=".8" stroke-linecap="round"/>
    <g class="mouth"><path d="M29 41c.8 4.4 5.2 4.4 6 0z" fill="#6E2E35"/><path d="M30.6 43.6c.7-1 2.1-1 2.8 0-.7.6-2.1.6-2.8 0z" fill="#C97F87"/></g>
    <path d="M28.6 40.2 18 38.6M28.6 41.2l-10.4 1M35.4 40.2 46 38.6M35.4 41.2l10.4 1" stroke="#9A938A" stroke-width=".5" stroke-linecap="round" opacity=".8"/>
  </g>
  <g class="mew" fill="none" stroke="#9A938A" stroke-width="1.2" stroke-linecap="round">
    <path d="M50 37.5q1.6 2.5 0 5"/><path d="M53.6 35.5q2.8 4.5 0 9"/><path d="M57.2 33.5q4 6.5 0 13"/></g>
</svg>`;
const SPEAKERS = {
  hoot: { art: OWL, title: "Hoot", subtitle: "Land wizard",
    hi: h => h < 5 ? "Hoo, up late." : h < 12 ? "Hoo! Good morning." : h < 18 ? "Hoo! Good afternoon." : "Hoo! Good evening.",
    lead: "Here's what the land wants:", quiet: "All quiet on the land. Enjoy it.", wait: "Hoo… listening to the forecast." },
  nimbu: { art: CAT, title: "Nimbu", subtitle: "Land cat",
    hi: h => h < 5 ? "Mrrp… up late too?" : h < 12 ? "Mrrrow! Good morning." : h < 18 ? "Mrrp! Good afternoon." : "Mrrow. Good evening.",
    lead: "The land told me this:", quiet: "All quiet on the land. Nap time.", wait: "Mrrp… listening to the forecast." },
};
const RISK = { 1: "low", 2: "moderate", 3: "high", 4: "very high", 5: "maximum" };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// the lead phrase (up to the first colon, or the first sentence) in bold so the lines scan
const lead = t => { const m = String(t).match(/^(.{4,70}?[:.])(\s.*)$/s); return m ? `<b>${esc(m[1])}</b>${esc(m[2])}` : esc(t); };
// a keyword for compact mode when a line carries no tag: the lead phrase, cut to three words
const shortTag = t => String(t).split(/[:.(]/)[0].split(/\s+/).slice(0, 3).join(" ");
// a few words of detail for compact mode: the line's own detail, or the first clause after its lead phrase
const detailOf = x => {
  if (x.detail != null) return x.detail;
  const m = String(x.text).match(/^(.{4,70}?[:.])\s+(.*)$/s);
  let r = m ? m[2].split(/[.;]/)[0].trim() : "";
  if (r.length > 48) { const c = r.split(",")[0]; r = c.length >= 12 && c.length <= 48 ? c : r.slice(0, 46).replace(/\s+\S*$/, "") + "…"; }
  return r;
};
const load = () => { try { return JSON.parse(localStorage.getItem("corujeira-land:advice")); } catch (e) { return null; } };

class CorujeiraHootCard extends HTMLElement {
  setConfig(c) {
    this._c = {
      speaker: "hoot", swap: !c.navigate, max: 6, compact: false, details: true, nearest_fire: "sensor.vigia_nearest_fire", fire: true, burn_window: true, stale_hours: 18,
      fire_risk: "sensor.vigia_fire_risk", fire_risk_tomorrow: "sensor.vigia_fire_risk_tomorrow",
      alert_level: "sensor.vigia_alert_level", fires_nearby: "sensor.vigia_fires_nearby", ...c,
    };
    this._colors = { ...KINDS, ...(c.colors || {}) };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    let saved = null;
    try { saved = this._c.swap ? localStorage.getItem("corujeira-land:speaker") : null; } catch (e) { /* storage blocked */ }
    this._who = SPEAKERS[saved] ? saved : SPEAKERS[this._c.speaker] ? this._c.speaker : "hoot";
    this._build();
    this._render();
  }
  getCardSize() { return 3; }
  getGridOptions() { return { columns: 12, rows: "auto" }; }

  set hass(h) {
    const prev = this._hass;
    this._hass = h;
    const ids = ["fire_risk", "fire_risk_tomorrow", "alert_level", "fires_nearby", "nearest_fire"].map(k => this._c[k]);
    if (!prev || ids.some(id => prev.states[id] !== h.states[id])) this._render();
  }
  connectedCallback() {
    this._onLand = this._onLand || (e => { this._land = e.detail; this._render(); });
    window.addEventListener("corujeira-land-advice", this._onLand);
    this._land = window.__corujeiraLand || this._land || load();
    this._render();
    // the day names in the advice ("today") go stale overnight, so look again every 30 minutes
    if (!this._timer) this._timer = setInterval(() => this._render(), 30 * 60e3);
  }
  disconnectedCallback() {
    window.removeEventListener("corujeira-land-advice", this._onLand);
    clearInterval(this._timer); this._timer = null;
  }

  _build() {
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { padding:14px 16px 14px 12px; }
        .wrap { display:flex; align-items:flex-start; gap:10px; }
        .who { flex:none; width:64px; display:flex; flex-direction:column; align-items:center; gap:2px; }
        .who.link { cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .owl, .cat { width:58px; height:67px; display:block; overflow:visible; }
        .lids > * { transform-box:fill-box; transform-origin:50% 0; transform:scaleY(0); animation:blink 7s infinite; }
        @keyframes blink { 0%, 95% { transform:scaleY(0); } 96.5%, 97.5% { transform:scaleY(1); } 99%, 100% { transform:scaleY(0); } }
        /* Nimbu: a faint rim so the black fur still reads on a dark card */
        .cat .fur { stroke:color-mix(in srgb, var(--primary-text-color, #343A40) 22%, transparent); stroke-width:.6; }
        .cat .tail { transform-box:view-box; transform-origin:20px 66px; animation:swish 6s ease-in-out infinite; }
        @keyframes swish { 0%, 100% { transform:rotate(4deg); } 50% { transform:rotate(-7deg); } }
        .cat .ear.l { transform-box:view-box; transform-origin:24px 28px; animation:flick 9s infinite; }
        @keyframes flick { 0%, 60%, 64%, 100% { transform:rotate(0); } 62% { transform:rotate(-12deg); } }
        .cat .head { transform-box:view-box; transform-origin:32px 46px; animation:tilt 11s ease-in-out infinite; }
        @keyframes tilt { 0%, 84%, 100% { transform:rotate(0); } 88%, 96% { transform:rotate(-5deg); } }
        .cat .mouth { transform-box:fill-box; transform-origin:50% 0; transform:scaleY(0); animation:meow 11s infinite; }
        .cat .shut { animation:shut 11s infinite; }
        @keyframes meow { 0%, 88%, 96%, 100% { transform:scaleY(0); } 89.5%, 94.5% { transform:scaleY(1); } }
        @keyframes shut { 0%, 88%, 96%, 100% { opacity:1; } 89%, 95% { opacity:0; } }
        .cat .mew path { opacity:0; animation:mew 11s infinite; }
        .cat .mew path:nth-child(2) { animation-delay:.12s; } .cat .mew path:nth-child(3) { animation-delay:.24s; }
        @keyframes mew { 0%, 89%, 98%, 100% { opacity:0; transform:translateX(-2px); } 91%, 95% { opacity:.9; transform:translateX(0); } }
        .cat.talk .mouth { animation:say 1.3s 1; } .cat.talk .shut { animation:sayshut 1.3s 1; } .cat.talk .head { animation:saytilt 1.3s 1; }
        .cat.talk .mew path { animation:saymew 1.3s 1; } .cat.talk .mew path:nth-child(2) { animation-delay:.1s; } .cat.talk .mew path:nth-child(3) { animation-delay:.2s; }
        @keyframes say { 0%, 100% { transform:scaleY(0); } 15%, 70% { transform:scaleY(1); } 85% { transform:scaleY(0); } }
        @keyframes sayshut { 0%, 90%, 100% { opacity:1; } 10%, 80% { opacity:0; } }
        @keyframes saytilt { 0%, 100% { transform:rotate(0); } 20%, 75% { transform:rotate(-5deg); } }
        @keyframes saymew { 0%, 100% { opacity:0; transform:translateX(-2px); } 25%, 70% { opacity:.9; transform:translateX(0); } }
        @media (prefers-reduced-motion: reduce) { .lids > *, .cat .tail, .cat .ear, .cat .head, .cat .mouth, .cat .shut, .cat .mew path { animation:none; } }
        .name { font-size:13px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--primary-text-color); line-height:1.1; }
        .sub { font-size:10.5px; color:var(--secondary-text-color); text-align:center; line-height:1.15; }
        .bubble { position:relative; flex:1; min-width:0; margin-top:6px; padding:10px 12px 11px; border-radius:16px;
          --hb:var(--hoot-bubble-color, color-mix(in srgb, var(--card-background-color, #fff) 45%, #fff));
          background:var(--hb); border:1px solid rgba(52,58,64,.16); }
        .bubble::before { content:""; position:absolute; left:-7px; top:22px; width:12px; height:12px; background:var(--hb);
          border-left:1px solid rgba(52,58,64,.16); border-bottom:1px solid rgba(52,58,64,.16); transform:rotate(45deg); }
        .hello { font-size:13.5px; line-height:1.4; color:var(--primary-text-color); margin-bottom:6px; }
        .hello:last-child { margin-bottom:0; }
        ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:7px; }
        li { display:flex; align-items:flex-start; gap:8px; font-size:13px; line-height:1.4; color:var(--primary-text-color); }
        li .ic { flex:none; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-top:-1px; }
        li .ic svg { width:15px; height:15px; }
        li b { font-weight:700; }
        ha-card.compact { padding:10px 12px 10px 8px; }
        .compact .wrap { align-items:center; gap:6px; }
        .compact .who { width:52px; }
        .compact .owl, .compact .cat { width:44px; height:51px; }
        .compact .name { font-size:11px; }
        .compact .sub, .compact .more { display:none; }
        .compact .hello { font-size:13px; color:var(--secondary-text-color); margin-bottom:7px; }
        .compact.chips-only .hello { display:none; }
        .compact ul.rows { flex-direction:column; flex-wrap:nowrap; gap:7px; }
        .compact ul.rows li { display:block; padding:0; border-radius:0; background:none !important; font-weight:400; white-space:normal; line-height:1.5; }
        .compact ul.rows .tag { display:inline-flex; align-items:center; gap:5px; padding:2px 10px 2px 4px; border-radius:999px; font-size:13.5px; font-weight:700; vertical-align:middle; margin-right:6px; }
        .compact ul.rows .det { font-size:13px; color:var(--secondary-text-color); vertical-align:middle; }
        .compact .bubble { margin-top:0; padding:8px 10px; }
        .compact .bubble::before { top:calc(50% - 6px); }
        .compact ul { flex-direction:row; flex-wrap:wrap; gap:6px; }
        .compact li { align-items:center; gap:5px; padding:3px 10px 3px 4px; border-radius:999px; font-size:13.5px; font-weight:700; line-height:1.3; white-space:nowrap; }
        .compact li .ic { width:20px; height:20px; margin:0; }
        .compact li.quiet { font-weight:400; color:var(--secondary-text-color); padding-left:4px; }
        ha-card.tap { cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .more { margin-top:6px; background:none; border:none; padding:0; font:inherit; font-size:12px; color:var(--secondary-text-color); cursor:pointer; }
      </style>
      <ha-card class="${this._c.compact ? `compact${this._c.details ? "" : " chips-only"}` : ""}">
        <div class="wrap">
          <div class="who"><div class="art"></div><div class="name"></div><div class="sub"></div></div>
          <div class="bubble"><div class="hello"></div><ul></ul><button class="more" hidden></button></div>
        </div>
      </ha-card>`;
    const nav = this._c.navigate, w = this.shadowRoot.querySelector(".who");
    const go = () => {
      history.pushState(null, "", nav.startsWith("#") ? location.pathname + location.search + nav : nav);
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
    };
    w.classList.add("link");
    if (nav && this._c.compact) {
      const card = this.shadowRoot.querySelector("ha-card");
      card.classList.add("tap");
      this.shadowRoot.querySelector(".bubble").addEventListener("click", go);
    }
    w.addEventListener("click", () => {
      if (nav) {
        go();
      } else if (this._c.swap) {
        this._who = this._who === "hoot" ? "nimbu" : "hoot";
        try { localStorage.setItem("corujeira-land:speaker", this._who); } catch (e) { /* storage blocked */ }
        this._speaker();
        this._render();
      }
      this._meow();
    });
    this._speaker();
    this.shadowRoot.querySelector(".more").addEventListener("click", () => { this._open = !this._open; this._render(); });
  }

  // Put the active speaker's drawing and name in place.
  _speaker() {
    const sp = SPEAKERS[this._who], mine = this._who === this._c.speaker, r = this.shadowRoot;
    r.querySelector(".art").innerHTML = sp.art;
    r.querySelector(".name").textContent = (mine && this._c.title) || sp.title;
    r.querySelector(".sub").textContent = (mine && this._c.subtitle) || sp.subtitle;
  }
  // A meow on demand (Nimbu only): replay the mouth and sound lines once.
  _meow() {
    const cat = this.shadowRoot.querySelector(".cat");
    if (!cat) return;
    cat.classList.remove("talk"); void cat.getBoundingClientRect(); cat.classList.add("talk");
    clearTimeout(this._talk); this._talk = setTimeout(() => cat.classList.remove("talk"), 1500);
  }

  // Fire lines from Vigia: an active alert first, then today's or tomorrow's risk, then a low-risk window for spark work.
  _fire() {
    const h = this._hass, c = this._c, out = [];
    if (!h || !c.fire) return out;
    const st = id => h.states[id], num = id => { const s = st(id); const v = s ? parseFloat(s.state) : NaN; return isNaN(v) ? null : v; };
    const al = st(c.alert_level);
    if (al && ["watch", "upwind", "close"].includes(al.state)) {
      const a = al.attributes, km = a.distance_km != null ? `${Math.round(a.distance_km)} km` : "nearby";
      const where = `${km}${a.direction ? " " + a.direction : ""}${a.upwind ? ", upwind" : ""}`;
      const what = al.state === "close" ? "Fill the buckets, keep the hoses ready, and have the go-bag by the car."
        : al.state === "upwind" ? "Smoke may reach us. Close the yurt, keep an eye on the sky and the Vigia map." : "Vigia is watching it.";
      out.push({ pri: 0, kind: "fire", text: `Fire ${where}. ${what}`, tag: `Fire ${km}${a.direction ? " " + a.direction : ""}` });
    } else {
      const n = num(c.fires_nearby);
      if (n) {
        const a = st(c.fires_nearby).attributes, R = Math.round(a.radius_km || 30);
        const inc = a.incidents || 0, heat = a.heat_spots != null ? a.heat_spots : Math.max(0, n - inc);
        const bits = [];
        if (inc) bits.push(`${inc === 1 ? "A reported fire" : inc + " reported fires"}`);
        if (heat) bits.push(`${heat === 1 ? "a satellite heat spot" : heat + " satellite heat spots"}`);
        let text = `${bits.join(" and ")} within ${R} km.`;
        text = text[0].toUpperCase() + text.slice(1);
        out.push({ pri: 2, kind: "fire", text: inc ? `${text} Vigia is watching.`
          : `${text} None reported to civil protection yet. Vigia is watching.`,
          tag: inc ? (inc === 1 ? "Fire reported" : `${inc} fires reported`) : heat === 1 ? "Heat spot" : `${heat} heat spots`,
          detail: (() => {
            const nf = st(c.nearest_fire), km = nf ? parseFloat(nf.state) : NaN, na = (nf && nf.attributes) || {};
            const where = !isNaN(km) ? `nearest ${Math.round(km)} km${na.direction ? " " + na.direction : ""}${na.upwind ? ", upwind" : ""}` : `within ${R} km`;
            return inc ? where : `${where}, none reported`;
          })() });
      }
    }
    const r0 = num(c.fire_risk), r1 = num(c.fire_risk_tomorrow), top = Math.max(r0 || 0, r1 || 0);
    if (top >= 3) {
      const day = (r0 || 0) >= top ? "today" : "tomorrow";
      out.push({ pri: top >= 4 ? 1 : 2, kind: "fire", text: top >= 4
        ? `Fire risk ${RISK[top]} ${day}: no burning and no sparks outdoors (grinders, chainsaws, mowing dry grass). Keep the hose ready.`
        : `Fire risk ${RISK[top]} ${day}: no burning, and keep spark-making tools away from dry grass.`,
        tag: `Fire risk ${RISK[top]}${day === "tomorrow" ? " tomorrow" : ""}` });
    } else if (c.burn_window && r0 != null && r0 <= 2 && (r1 == null || r1 <= 2)) {
      const m = new Date().getMonth() + 1;
      // Only in the dry months, when a calm day is worth noticing; in winter the risk is nearly always low.
      if (m >= 5 && m <= 10) out.push({ pri: 3, kind: "fire", text: r0 <= 1
        ? "Fire risk low: a good window for grinding, welding and chainsaw work, or a fire in the sauna and fire pit."
        : "Fire risk moderate: fine for the sauna and fire pit, and spark work with a hose near any dry grass.",
        tag: r0 <= 1 ? "Spark work OK" : "Fire risk moderate",
        detail: r0 <= 1 ? "good for grinding, welding, the sauna" : "fine for the sauna and fire pit" });
    }
    return out;
  }

  _render() {
    if (!this.shadowRoot || !this._c) return;
    const land = this._land, fresh = land && land.ts && Date.now() - land.ts < this._c.stale_hours * 3600e3;
    const weather = fresh ? land.items || [] : [];
    const all = [...this._fire(), ...weather].sort((a, b) => a.pri - b.pri);
    const max = this._c.max, shown = this._open || this._c.compact ? all : all.slice(0, max);
    const sp = SPEAKERS[this._who] || SPEAKERS.hoot, hi = sp.hi(new Date().getHours());
    const hello = this.shadowRoot.querySelector(".hello");
    hello.textContent = !land && !all.length ? sp.wait : all.length ? `${hi} ${sp.lead}` : `${hi} ${sp.quiet}`;
    const ul = this.shadowRoot.querySelector("ul");
    if (this._c.compact && this._c.details) {
      hello.textContent = !land && !all.length ? sp.wait : all.length ? hi : `${hi} ${sp.quiet}`;
      ul.className = "rows";
      ul.innerHTML = shown.map(x => {
        const col = esc(this._colors[x.kind] || this._colors.plant), d = detailOf(x);
        return `<li title="${esc(x.text)}"><span class="tag" style="color:color-mix(in srgb, ${col} 82%, #000);background:color-mix(in srgb, ${col} 14%, transparent)"><span class="ic" style="color:${col}">${icon(x.kind)}</span>${esc(x.tag || shortTag(x.text))}</span>${d ? `<span class="det">${esc(d)}</span>` : ""}</li>`;
      }).join("");
    } else if (this._c.compact) {
      ul.innerHTML = shown.length ? shown.map(x => {
        const col = esc(this._colors[x.kind] || this._colors.plant);
        return `<li style="color:color-mix(in srgb, ${col} 82%, #000);background:color-mix(in srgb, ${col} 14%, transparent)" title="${esc(x.text)}"><span class="ic" style="color:${col}">${icon(x.kind)}</span>${esc(x.tag || shortTag(x.text))}</li>`;
      }).join("") : `<li class="quiet">${esc(!land ? sp.wait : sp.quiet)}</li>`;
    } else ul.innerHTML = shown.map(x => {
      const col = this._colors[x.kind] || this._colors.plant;
      return `<li><span class="ic" style="color:${esc(col)};background:color-mix(in srgb, ${esc(col)} 13%, transparent)">${icon(x.kind)}</span><span>${lead(x.text)}</span></li>`;
    }).join("");
    const more = this.shadowRoot.querySelector(".more");
    more.hidden = all.length <= max;
    more.textContent = this._open ? "Show less" : `${all.length - max} more`;
  }
}
if (!customElements.get("corujeira-hoot-card")) customElements.define("corujeira-hoot-card", CorujeiraHootCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === "corujeira-hoot-card"))
  window.customCards.push({ type: "corujeira-hoot-card", name: "A Corujeira Hoot", description: "Hoot the land wizard or Nimbu the land cat: land advice from the forecast and fire watch in a speech bubble." });
})();

// ---- corujeira-meteogram-card.js
/* A Corujeira meteogram: multi-model forecast from Open-Meteo, drawn like a meteoblue MultiModel meteogram.
   One thin line per model with the green mean on top, dashed daily high/low trend lines, hourly rain bars
   layered meteoblue-style by how many models agree, wind (mean, model spread, direction arrows) on the rain
   panel's right-hand axis, a per-day row (high, low, rain amount and chance), a written forecast, up to four
   green "land" advice lines (frost, heavy rain, gales, heat, low sun / battery, watering, planting windows,
   woodland foraging and the shiitake logs; thresholds in LAND), daylight bands, 3/5/7 day pills, and thumb
   scrubbing. At WIDE_MIN px and wider the two charts sit side by side under the summary and advice.
   Options: show_models (legend of models, default true), navigate (title opens e.g. "#weather"),
   advice (land advice lines under the summary, default true; the advice is published either way as the
   window event "corujeira-land-advice" with { ts, items: [{ pri, kind, text, tag }] } for the Hoot card;
   tag is a two-word keyword such as "Frost Thu"), hidden (fetch and publish the advice but draw nothing,
   for a screen that shows the forecast only in a pop-up), compact (a weather tile instead of the charts: now
   from `current` (a weather entity) with humidity, wind and `uv` (sensor), the written forecast, and a strip
   of the next five days; with navigate set, tapping anywhere opens it, e.g. the full meteogram pop-up). The tablet's browser fetches the data directly (nothing runs in
   Home Assistant) and keeps the last forecast for when the internet is off. Remove this resource to revert. */
(() => {
const MODELS = [
  ["ecmwf_ifs025", "ECMWF", "#C2574A"],
  ["ecmwf_aifs025_single", "ECMWF AI", "#E8913A"],
  ["icon_seamless", "ICON", "#4A9FD0"],
  ["gfs_seamless", "GFS", "#8E6BBF"],
  ["meteofrance_seamless", "Météo-France", "#3E8E7E"],
  ["ukmo_seamless", "UK Met Office", "#D4A72C"],
  ["gem_seamless", "GEM", "#A0526D"],
  ["jma_seamless", "JMA", "#7D9A3A"],
  ["cma_grapes_global", "CMA", "#8C6D46"],
  ["knmi_seamless", "KNMI", "#2F6FA8"],
  ["dmi_seamless", "DMI", "#B5651D"],
];
const API = "https://api.open-meteo.com/v1/forecast";
const DAY_TOP = 32, T_H = 200, TICK_H = 18, GAP = 12, P_H = 110, LEFT = 34, RIGHT = 34;
const WIDE_MIN = 820, PANE_GAP = 18; // card width at which the two charts sit side by side
const RAIN_MIN = 0.1;          // mm/h that counts as raining in an hour
const WET_DAY = 1;             // mm in a day that counts as a wet day for one model
const WINDY = 50;              // km/h gust (median of models' daily max) worth a mention in the summary
const MEAN = "#2E8B57", HI_C = "#D9573F", LO_C = "#3D9BC9", WIND_C = "#5E665B", LAND_C = "#2E7D4F";
// land advice thresholds (all on the median of the models)
const LAND = { frost: 2, heavyRain: 15, gale: 60, hot: 30, dullFrac: 0.45, dullAbs: 1.2, brightFrac: 0.85, brightMin: 2, dryRun: 4, dryHigh: 30, rainDue: 5,
  soak: 20,                      // mm over consecutive wet days (each >= 3 mm) that counts as a soaking rain
  forageFrom: 7, forageTo: 14,   // days after a soaking rain when woodland mushrooms come up
  logRain: 10, farmFrom: 2, farmTo: 5, // open-air shiitake logs fruit a few days after a decent rain (mm)
  forageMonths: [9, 10, 11, 12] };
const ADVICE_MAX = 4;
const WIND_TICKS = [10, 16, 20, 30, 40, 60, 80, 100, 120];
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// Smooth line through points that never overshoots them (monotone cubic, Fritsch–Carlson)
const smooth = pts => {
  const n = pts.length;
  if (n < 2) return "";
  const f = p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const dx = [], s = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; s[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  m[0] = s[0]; m[n - 1] = s[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (s[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / s[i], b = m[i + 1] / s[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * s[i]; m[i + 1] = t * b * s[i]; }
  }
  let d = `M${f(pts[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1], h = dx[i] / 3;
    d += `C${f([p1[0] + h, p1[1] + m[i] * h])} ${f([p2[0] - h, p2[1] - m[i + 1] * h])} ${f(p2)}`;
  }
  return d;
};
// meteoblue-style agreement ramp: bright cyan (one model) -> periwinkle -> deep navy (every model)
const RAMP = [[0, [0, 232, 255]], [0.5, [140, 140, 232]], [1, [12, 36, 128]]];
const agreeColor = t => {
  t = Math.max(0, Math.min(1, t));
  const j = t <= RAMP[1][0] ? 0 : 1, [a, ca] = RAMP[j], [b, cb] = RAMP[j + 1], u = (t - a) / (b - a);
  return `rgb(${ca.map((c, i) => Math.round(c + (cb[i] - c) * u)).join(",")})`;
};
const RAIN_TICKS = [0.5, 1, 2, 4, 6, 8, 10, 20, 30, 40, 60, 80]; // halves label cleanly
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
// Land advice goes out to any card on the page (event + window global) and into localStorage for the next load.
const publishLand = items => {
  const d = { ts: Date.now(), items };
  window.__corujeiraLand = d;
  store.set("corujeira-land:advice", d);
  window.dispatchEvent(new CustomEvent("corujeira-land-advice", { detail: d }));
};

class CorujeiraMeteogramCard extends HTMLElement {
  setConfig(c) {
    this._c = { days: 7, refresh_minutes: 30, title: "Meteogram", show_models: true, advice: true, silo_low: 40, ...c };
    const want = Array.isArray(c.models) ? c.models : MODELS.map(m => m[0]);
    this._models = want.map(id => MODELS.find(m => m[0] === id) || [id, id, "#9AA5B1"]);
    this._hidden = new Set();
    const pref = store.get("corujeira-meteogram:days");
    this._days = [3, 5, 7].includes(pref) ? pref : this._c.days;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._build();
    this._visible();
    if (this._s) this._render();
  }
  getCardSize() { return this._c && this._c.hidden ? 0 : 8; }
  getGridOptions() { return { columns: 12, rows: "auto" }; }
  // hidden: true keeps the forecast and advice running for the Hoot card without drawing anything
  // (the dashboard drops the empty slot the same way it does for a conditional card)
  _visible() {
    const hide = !!(this._c && this._c.hidden);
    if (this.hidden === hide && this._told) return;
    this.hidden = hide; this._told = true;
    this.dispatchEvent(new CustomEvent("card-visibility-changed", { detail: { value: !hide }, bubbles: true, composed: true }));
  }

  set hass(h) {
    const prevH = this._hass;
    this._hass = h;
    if (this._c.compact && this._s && prevH && [this._c.current, this._c.uv].some(id => id && prevH.states[id] !== h.states[id])) this._render();
    // the silo level feeds the pump advice; refresh just the advice when it changes
    const sv = this._c.silo && h.states[this._c.silo] ? h.states[this._c.silo].state : null;
    if (sv !== this._siloV) { this._siloV = sv; if (this._s) this._renderAdvice(); }
    if (!this._started) {
      this._started = true;
      this._loadCache();
      this._maybeFetch(true);
    }
    if (!this._timer && this.isConnected) this._timer = setInterval(() => this._maybeFetch(), 5 * 60e3);
  }
  connectedCallback() {
    this._told = false; this._visible();
    if (!this._ro) {
      this._ro = new ResizeObserver(() => {
        const w = Math.round(this.shadowRoot.querySelector(".plot").clientWidth);
        if (w > 0 && w !== this._w) { this._w = w; this._render(); }
      });
      this._ro.observe(this);
    }
    if (this._hass && !this._timer) this._timer = setInterval(() => this._maybeFetch(), 5 * 60e3);
    this._onVis = this._onVis || (() => this._maybeFetch());
    document.addEventListener("visibilitychange", this._onVis);
  }
  disconnectedCallback() {
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    clearInterval(this._timer); this._timer = null;
    if (this._onVis) document.removeEventListener("visibilitychange", this._onVis);
  }

  // ---- data
  _coords() {
    const z = this._hass && this._hass.states["zone.home"];
    const lat = this._c.latitude ?? (z && z.attributes.latitude), lon = this._c.longitude ?? (z && z.attributes.longitude);
    if (lat == null || lon == null) return null;
    return [Math.round(lat * 100) / 100, Math.round(lon * 100) / 100];
  }
  // bump the version whenever the requested variables change, so an old cached forecast isn't reused
  _key() { const c = this._coords(); return c ? `corujeira-meteogram:v4:${c[0]},${c[1]}` : null; }
  _loadCache() {
    const k = this._key(), hit = k && store.get(k);
    if (hit && hit.data) { this._ts = hit.ts; this._past = hit.past || null; this._setData(hit.data); }
  }
  _maybeFetch(force) {
    if (document.visibilityState === "hidden" && !force) return;
    if (this._ts && Date.now() - this._ts < this._c.refresh_minutes * 60e3) return;
    this._fetch();
  }
  _fetch() {
    const c = this._coords();
    if (!c || this._busy) return;
    this._busy = true;
    const q = new URLSearchParams({
      latitude: c[0], longitude: c[1], daily: "sunrise,sunset",
      hourly: "temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,shortwave_radiation",
      models: this._models.map(m => m[0]).join(","), forecast_days: 7, timezone: "auto",
    });
    // the last 14 days of rain (single best-match model) let the mushroom advice know when the woods last got a soaking
    const pq = new URLSearchParams({
      latitude: c[0], longitude: c[1], daily: "precipitation_sum", past_days: 14, forecast_days: 1, timezone: "auto",
    });
    const past = fetch(`${API}?${pq}`).then(r => r.ok ? r.json() : null).then(j => j && j.daily ? j.daily : null).catch(() => null);
    fetch(`${API}?${q}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.reason || r.status), () => Promise.reject(r.status)))
      .then(j => past.then(p => {
        if (j.error) throw j.reason;
        this._ts = Date.now();
        this._err = null;
        if (p) this._past = p;
        store.set(this._key(), { ts: this._ts, data: j, past: this._past || null });
        this._setData(j);
      }))
      .catch(e => { this._err = String(e || "no connection"); this._renderMeta(); })
      .finally(() => { this._busy = false; });
  }
  _setData(j) {
    const H = j.hourly, n = H.time.length;
    const models = this._models.map(([id, name, color]) => ({
      id, name, color, temp: H[`temperature_2m_${id}`] || [], rain: H[`precipitation_${id}`] || [],
      wind: H[`wind_speed_10m_${id}`] || [], gust: H[`wind_gusts_10m_${id}`] || [], dir: H[`wind_direction_10m_${id}`] || [],
      sw: H[`shortwave_radiation_${id}`] || [],
    })).filter(m => m.temp.some(v => v != null));
    const mean = [], rainWet = [], rainHit = [], rainN = [], lo = [], hi = [];
    const wMean = [], wLo = [], wHi = [], gMed = [], wDir = [];
    for (let i = 0; i < n; i++) {
      // wind: mean speed and model spread, median gust, and the vector-averaged direction (blowing FROM)
      const ws = models.map(m => m.wind[i]).filter(v => v != null), gs = models.map(m => m.gust[i]).filter(v => v != null);
      wMean.push(ws.length >= 2 ? ws.reduce((a, b) => a + b, 0) / ws.length : null);
      wLo.push(ws.length ? Math.min(...ws) : null);
      wHi.push(ws.length ? Math.max(...ws) : null);
      gMed.push(median(gs));
      let u = 0, v = 0;
      models.forEach(m => { const d = m.dir[i], sp = m.wind[i]; if (d != null && sp != null) { u += sp * Math.sin(d * Math.PI / 180); v += sp * Math.cos(d * Math.PI / 180); } });
      wDir.push(u || v ? (Math.atan2(u, v) * 180 / Math.PI + 360) % 360 : null);
      const t = models.map(m => m.temp[i]).filter(v => v != null);
      mean.push(t.length >= 2 ? t.reduce((a, b) => a + b, 0) / t.length : null);
      lo.push(t.length ? Math.min(...t) : null);
      hi.push(t.length ? Math.max(...t) : null);
      const r = models.map(m => m.rain[i]).filter(v => v != null), wet = r.filter(v => v >= RAIN_MIN);
      rainN.push(r.length);
      rainHit.push(wet.length);
      rainWet.push(wet.sort((a, b) => b - a)); // wettest model first
    }
    const D = j.daily || {}, hm = s => { const m = /T(\d\d):(\d\d)/.exec(s || ""); return m ? +m[1] + m[2] / 60 : null; };
    const firstKey = pre => Object.keys(D).find(k => k.startsWith(pre) && (D[k] || []).some(v => v));
    const rk = firstKey("sunrise"), sk = firstKey("sunset");
    // Daily interpretation: each model's own high, low and rain total for the calendar day, then the
    // median across models (robust to one outlier). Models covering less than 18 h of a day are left out.
    const days = (D.time || []).map((d, i) => {
      const a = i * 24, b = Math.min(n, a + 24), highs = [], lows = [], totals = [], gustMax = [], suns = [];
      for (const m of models) {
        const sw = m.sw.slice(a, b).filter(v => v != null);
        if (sw.length >= 18) suns.push(sw.reduce((x, y) => x + y, 0) / 1000); // kWh/m² of sunshine that day
        const t = m.temp.slice(a, b).filter(v => v != null);
        if (t.length >= 18) { highs.push(Math.max(...t)); lows.push(Math.min(...t)); }
        const g = m.gust.slice(a, b).filter(v => v != null);
        if (g.length >= 18) gustMax.push(Math.max(...g));
        const r = m.rain.slice(a, b).filter(v => v != null);
        if (r.length >= 18) totals.push(r.reduce((x, y) => x + y, 0));
      }
      const wetTotals = totals.filter(v => v >= WET_DAY);
      let hiAt = null, loAt = null;
      for (let h = a; h < b; h++) if (mean[h] != null) {
        if (hiAt == null || mean[h] > mean[hiAt]) hiAt = h;
        if (loAt == null || mean[h] < mean[loAt]) loAt = h;
      }
      return {
        date: d, rise: rk ? hm(D[rk][i]) : 7, set: sk ? hm(D[sk][i]) : 19,
        high: median(highs), low: median(lows), hiAt, loAt,
        n: totals.length, wet: wetTotals.length, p: totals.length ? wetTotals.length / totals.length : 0,
        amt: median(wetTotals) || 0, gust: median(gustMax), sun: median(suns),
      };
    });
    const t0 = Date.parse(H.time[0] + ":00Z") - (j.utc_offset_seconds || 0) * 1000;
    const hasWind = wMean.some(v => v != null);
    this._s = { n, times: H.time, t0, models, mean, lo, hi, rainWet, rainHit, rainN, days, wMean, wLo, wHi, gMed, wDir, hasWind };
    this._render();
  }

  // ---- DOM
  _build() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { display:block; padding:12px 12px 10px; box-sizing:border-box; font-family:'Lato',sans-serif; }
        .head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:2px; }
        .title { font-size:15px; font-weight:700; color:var(--primary-text-color); }
        .pills { display:flex; gap:4px; }
        .pills button { all:unset; box-sizing:border-box; cursor:pointer; font-size:13px; font-weight:700; line-height:1; padding:6px 10px;
          border-radius:999px; color:var(--secondary-text-color); background:color-mix(in srgb, var(--primary-text-color) 7%, transparent);
          -webkit-tap-highlight-color:transparent; transition:background .15s, color .15s, transform .1s; }
        .pills button:active { transform:scale(.94); }
        .pills button.on { background:#3D9BC9; color:#fff; box-shadow:0 1px 3px rgba(0,0,0,.15); cursor:default; }
        .plot { position:relative; min-height:120px; }
        svg { display:block; width:100%; touch-action:pan-y; user-select:none; -webkit-user-select:none; }
        svg text { font-family:'Lato',sans-serif; fill:var(--secondary-text-color); font-size:10.5px; }
        svg text.day { font-size:12px; font-weight:700; fill:var(--primary-text-color); }
        svg text.wk { fill:#C2574A; }
        svg text.unit { font-size:10px; }
        .bg { fill:color-mix(in srgb, var(--primary-text-color) 3%, transparent); }
        .sun { fill:rgba(233,169,44,.14); }
        .grid { stroke:rgba(52,58,64,.12); stroke-width:1; }
        .sep { stroke:rgba(52,58,64,.28); stroke-width:1; }
        .now { stroke:#C2574A; stroke-width:1.2; stroke-dasharray:3 3; }
        .model { fill:none; stroke-width:1.1; stroke-linejoin:round; stroke-linecap:round; opacity:.5; }
        .mean-h { fill:none; stroke:var(--card-background-color, #fff); stroke-width:6.5; stroke-linejoin:round; stroke-linecap:round; opacity:.85; }
        .mean { fill:none; stroke:${MEAN}; stroke-width:3; stroke-linejoin:round; stroke-linecap:round; }
        .trend { fill:none; stroke-width:1.6; stroke-dasharray:5 4; stroke-linecap:round; }
        .trend.hi { stroke:${HI_C}; } .trend.lo { stroke:${LO_C}; }
        .mk { stroke:var(--card-background-color, #fff); stroke-width:1.5; }
        svg text.shi { font-size:12.5px; font-weight:700; fill:${HI_C}; }
        svg text.slo { font-size:12.5px; font-weight:700; fill:${LO_C}; }
        svg text.sdry { font-size:11px; fill:var(--secondary-text-color); }
        svg text.swet { font-size:11.5px; font-weight:700; fill:#2A6FB0; }
        svg text.sp { font-size:10px; fill:#2A6FB0; }
        .wband { fill:rgba(94,102,91,.13); }
        .wline { fill:none; stroke:${WIND_C}; stroke-width:1.7; stroke-linejoin:round; stroke-linecap:round; }
        .warrow { fill:${WIND_C}; opacity:.75; }
        svg text.wax { fill:${WIND_C}; }
        .sw.wind { background:${WIND_C}; height:2px; }
        .title.link { cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .title .chev { color:var(--secondary-text-color); font-weight:400; margin-left:4px; }
        .summary { font-size:13.5px; line-height:1.45; color:var(--primary-text-color); margin:4px 2px 6px; }
        .summary:empty { display:none; }
        .advice { display:flex; flex-direction:column; gap:3px; margin:0 2px 8px; }
        .advice:empty { display:none; }
        .panes { display:grid; grid-template-columns:1fr 1fr; gap:${PANE_GAP}px; }
        .pane { min-width:0; }
        .tipline { display:flex; align-items:flex-start; gap:6px; font-size:13px; line-height:1.4; color:${LAND_C}; }
        .tipline ha-icon { --mdc-icon-size:16px; flex:none; margin-top:1px; color:${LAND_C}; }
        .scrub { stroke:var(--primary-text-color); stroke-width:1; opacity:.55; }
        .tip { position:absolute; top:${DAY_TOP + 6}px; display:none; pointer-events:none; background:var(--card-background-color, #fff);
          border:1px solid rgba(52,58,64,.18); border-radius:10px; padding:6px 9px; font-size:12px; line-height:1.4;
          box-shadow:0 2px 8px rgba(0,0,0,.12); white-space:nowrap; color:var(--primary-text-color); z-index:2; }
        .tip b { font-weight:700; }
        .tip .dim { color:var(--secondary-text-color); }
        .legend { display:flex; flex-wrap:wrap; gap:5px 12px; margin-top:8px; font-size:11.5px; color:var(--secondary-text-color); }
        .chip { display:inline-flex; align-items:center; gap:5px; cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .chip.off { opacity:.35; }
        .chip.static { cursor:default; color:var(--primary-text-color); }
        .sw { width:14px; height:3px; border-radius:2px; flex:none; }
        .sw.mean { height:4px; background:${MEAN}; }
        .sw.hi, .sw.lo { height:2px; border-radius:0; }
        .sw.hi { background:repeating-linear-gradient(90deg, ${HI_C} 0 4px, transparent 4px 7px); }
        .sw.lo { background:repeating-linear-gradient(90deg, ${LO_C} 0 4px, transparent 4px 7px); }
        .foot { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:8px; font-size:11px; color:var(--secondary-text-color); flex-wrap:wrap; }
        .agree { display:flex; align-items:center; gap:6px; }
        .grad { width:84px; height:8px; border-radius:4px; background:linear-gradient(90deg, ${agreeColor(0)}, ${agreeColor(0.5)}, ${agreeColor(1)}); }
        ha-card.compact .head, ha-card.compact .legend, ha-card.compact .foot, ha-card.compact .advice { display:none; }
        ha-card.compact .plot { min-height:0; }
        ha-card.compact.tap { cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .now { display:flex; align-items:center; gap:10px; margin:2px 0 6px; }
        .now .big { --mdc-icon-size:40px; color:#D4A72C; flex:none; }
        .now .t { font-size:34px; font-weight:300; line-height:1; color:var(--primary-text-color); }
        .now .cond { font-size:14px; color:var(--secondary-text-color); line-height:1.2; }
        .now .chips { margin-left:auto; display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
        .now .chip { display:flex; align-items:center; gap:4px; height:28px; padding:0 10px; border-radius:999px; font-size:13px;
          background:rgba(52,58,64,.06); color:var(--primary-text-color); white-space:nowrap; }
        .now .chip ha-icon { --mdc-icon-size:16px; color:var(--secondary-text-color); }
        .strip { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:4px; margin-top:10px; }
        .strip .d { text-align:center; padding:6px 0 4px; border-radius:12px; background:rgba(52,58,64,.04); }
        .strip .d.today { background:rgba(46,139,87,.09); }
        .strip .nm { font-size:12.5px; font-weight:700; color:var(--primary-text-color); }
        .strip .d.wk .nm { color:${HI_C}; }
        .strip ha-icon { --mdc-icon-size:24px; color:var(--secondary-text-color); margin:2px 0; }
        .strip .hl { font-size:13px; white-space:nowrap; }
        .strip .hl .h { color:${HI_C}; font-weight:700; } .strip .hl .l { color:${LO_C}; font-weight:700; }
        .strip .r { font-size:11.5px; color:var(--secondary-text-color); min-height:15px; }
        .strip .r.wet { color:#2A6FB0; font-weight:700; }
        .empty { padding:40px 0; text-align:center; color:var(--secondary-text-color); font-size:13px; }
      </style>
      <ha-card>
        <div class="head"><div class="title">${esc(this._c.title)}</div><div class="pills"></div></div>
        <div class="info"><div class="summary"></div><div class="advice"></div></div>
        <div class="plot"><div class="empty">Loading forecast…</div></div>
        <div class="legend"></div>
        <div class="foot"><div class="agree"><span>Rain: models agreeing</span><span>0</span><span class="grad"></span><span>100%</span></div><div class="meta"></div></div>
      </ha-card>`;
    const nav = this._c.navigate;
    if (this._c.compact) {
      const card = this.shadowRoot.querySelector("ha-card");
      card.classList.add("compact");
      if (nav) {
        card.classList.add("tap");
        card.addEventListener("click", () => {
          history.pushState(null, "", nav.startsWith("#") ? location.pathname + location.search + nav : nav);
          window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
        });
      }
    } else if (nav) {
      const t = this.shadowRoot.querySelector(".title");
      t.classList.add("link");
      t.insertAdjacentHTML("beforeend", `<span class="chev">›</span>`);
      t.addEventListener("click", () => {
        history.pushState(null, "", nav.startsWith("#") ? location.pathname + location.search + nav : nav);
        window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      });
    }
    const pills = this.shadowRoot.querySelector(".pills");
    [3, 5, 7].forEach(d => {
      const b = document.createElement("button");
      b.textContent = d + " days";
      b.addEventListener("click", e => {
        e.stopPropagation();
        if (this._days === d) return;
        this._days = d;
        store.set("corujeira-meteogram:days", d);
        this._render();
      });
      pills.appendChild(b);
    });
  }

  _render() {
    this.shadowRoot.querySelectorAll(".pills button").forEach(b => b.classList.toggle("on", b.textContent === this._days + " days"));
    const s = this._s, plot = this.shadowRoot.querySelector(".plot");
    if (!s) return;
    if (this._c.hidden) { this._renderAdvice(); return; }
    if (this._c.compact) { this._renderCompact(); this._renderAdvice(); return; }
    const W = this._w || plot.clientWidth;
    if (!W) { this._renderAdvice(); return; }
    const hours = Math.min(s.n, this._days * 24), days = Math.ceil(hours / 24);
    const lang = (this._hass && this._hass.locale && this._hass.locale.language) || "en";
    // wide: temperature and rain/wind side by side, info in two columns above; otherwise one stacked chart
    const wide = W >= WIDE_MIN;
    this.shadowRoot.querySelector("ha-card").classList.toggle("wide", wide);
    if (wide) {
      const pw = Math.floor((W - PANE_GAP) / 2);
      const a = this._draw(pw, hours, days, lang, true, false), b = this._draw(pw, hours, days, lang, false, true);
      plot.innerHTML = `<div class="panes"><div class="pane">${a.svg}</div><div class="pane">${b.svg}</div></div><div class="tip"></div>`;
      const svgs = plot.querySelectorAll("svg");
      this._wireScrub(plot, svgs[0], a.geo);
      this._wireScrub(plot, svgs[1], b.geo);
    } else {
      const a = this._draw(W, hours, days, lang, true, true);
      plot.innerHTML = `${a.svg}<div class="tip"></div>`;
      this._wireScrub(plot, plot.querySelector("svg"), a.geo);
    }
    this._renderLegend();
    this._renderMeta();
    this.shadowRoot.querySelector(".summary").textContent = this._summary(s.days.slice(0, days), lang);
    this._renderAdvice();
  }
  // The advice is always worked out and published for other cards (the Hoot card shows it); the inline
  // lines under the summary only appear with advice: true.
  _renderAdvice() {
    const lang = (this._hass && this._hass.locale && this._hass.locale.language) || "en";
    const adv = this._s ? this._advice(this._s.days, lang, this._past) : [];
    if (this._s) publishLand(adv.map(({ pri, kind, text, tag, detail }) => ({ pri, kind, text, tag, detail })));
    this.shadowRoot.querySelector(".advice").innerHTML = (this._c.advice ? adv.slice(0, ADVICE_MAX) : []).map(x =>
      `<div class="tipline"><ha-icon icon="mdi:sprout-outline"></ha-icon><span>${esc(x.text)}</span></div>`).join("");
  }

  // Compact weather tile: now, the written forecast, five-day strip.
  _renderCompact() {
    const s = this._s, h = this._hass, c = this._c, root = this.shadowRoot;
    const lang = (h && h.locale && h.locale.language) || "en";
    const COND = { "clear-night": ["Clear", "weather-night"], cloudy: ["Cloudy", "weather-cloudy"], fog: ["Fog", "weather-fog"],
      hail: ["Hail", "weather-hail"], lightning: ["Thunder", "weather-lightning"], "lightning-rainy": ["Thunder and rain", "weather-lightning-rainy"],
      partlycloudy: ["Partly cloudy", "weather-partly-cloudy"], pouring: ["Pouring", "weather-pouring"], rainy: ["Rain", "weather-rainy"],
      snowy: ["Snow", "weather-snowy"], "snowy-rainy": ["Sleet", "weather-snowy-rainy"], sunny: ["Sunny", "weather-sunny"], windy: ["Windy", "weather-windy"] };
    const w = c.current && h && h.states[c.current], wa = (w && w.attributes) || {};
    const [label, icon] = (w && COND[w.state]) || [w ? w.state : "", "weather-partly-cloudy"];
    const uv = c.uv && h && h.states[c.uv];
    const chips = [];
    if (wa.humidity != null) chips.push(`<span class="chip"><ha-icon icon="mdi:water-percent"></ha-icon>${Math.round(wa.humidity)}%</span>`);
    if (wa.wind_speed != null) chips.push(`<span class="chip"><ha-icon icon="mdi:weather-windy"></ha-icon>${Math.round(wa.wind_speed)} ${esc(wa.wind_speed_unit || "km/h")}</span>`);
    if (uv && !isNaN(parseFloat(uv.state))) chips.push(`<span class="chip"><ha-icon icon="mdi:sun-wireless-outline"></ha-icon>UV ${Math.round(parseFloat(uv.state))}</span>`);
    const temp = wa.temperature != null ? `${Math.round(wa.temperature * 10) / 10}°` : "";
    const days = s.days.slice(0, 5), best = Math.max(0, ...s.days.map(d => d.sun || 0));
    const today = new Date().toLocaleDateString("sv");
    const dayIcon = d => d.p >= 0.5 && d.amt >= 8 ? "weather-pouring" : d.p >= 0.5 && d.amt >= 1 ? "weather-rainy"
      : d.sun != null && best && d.sun >= best * 0.7 ? "weather-sunny" : d.sun != null && best && d.sun >= best * 0.4 ? "weather-partly-cloudy" : "weather-cloudy";
    const strip = days.map(d => {
      const dt = new Date(d.date + "T12:00:00"), wk = dt.getDay() === 0 || dt.getDay() === 6;
      const nm = d.date === today ? "Today" : dt.toLocaleDateString(lang, { weekday: "short" });
      const mm = d.amt * d.p, wet = d.p >= 0.5 && d.amt >= WET_DAY;
      return `<div class="d${d.date === today ? " today" : ""}${wk ? " wk" : ""}"><div class="nm">${esc(nm)}</div><ha-icon icon="mdi:${dayIcon(d)}"></ha-icon>
        <div class="hl">${d.high != null ? `<span class="h">${Math.round(d.high)}°</span> <span class="l">${Math.round(d.low)}°</span>` : ""}</div>
        <div class="r${wet ? " wet" : ""}">${wet ? `${f1(mm)} mm` : d.p >= 0.3 ? "showers" : "dry"}</div></div>`;
    }).join("");
    root.querySelector(".plot").innerHTML = `<div class="now">${w ? `<ha-icon class="big" icon="mdi:${icon}"></ha-icon>` : ""}<div><div class="t">${temp}</div><div class="cond">${esc(label)}</div></div><div class="chips">${chips.join("")}</div></div>`;
    root.querySelector(".summary").textContent = this._summary(s.days.slice(0, 5), lang);
    // order: now, written forecast, five-day strip
    const card = root.querySelector("ha-card"), plot = root.querySelector(".plot"), info = root.querySelector(".info");
    let st = root.querySelector(".strip");
    if (!st) { st = document.createElement("div"); st.className = "strip"; }
    card.prepend(plot); plot.after(info); info.after(st);
    st.innerHTML = strip;
  }

  // Draws one SVG: the temperature panel, the rain/wind panel, or both stacked. Returns the markup and the
  // geometry the scrubber needs.
  _draw(W, hours, days, lang, showT, showR) {
    const s = this._s;
    const right = showR ? RIGHT : 12;
    const plotW = W - LEFT - right, dayW = plotW / days, narrow = dayW < 64;
    const hx = i => LEFT + i / hours * plotW;
    let tTop = null, tBot = null, pTop = null, pBot = null;
    if (showT) { tTop = DAY_TOP; tBot = tTop + T_H; }
    if (showR) { pTop = showT ? tBot + TICK_H + GAP : DAY_TOP; pBot = pTop + (showT ? P_H : T_H); }
    const rowTop = showR ? (showT ? pBot : pBot + TICK_H) : tBot + TICK_H;
    const hiY = rowTop + 18, loY = rowTop + 31;
    const rainY = rowTop + (showT ? (narrow ? 48 : 34) : 16), probY = rainY + 13;
    const H = showR ? probY + 7 : (narrow ? loY + 8 : hiY + 8);
    const vis = s.models.filter(m => !this._hidden.has(m.id));
    const pool = vis.length ? vis : s.models;
    const panels = [];
    if (showT) panels.push([tTop, tBot]);
    if (showR) panels.push([pTop, pBot]);

    // temperature scale
    let tmin = Infinity, tmax = -Infinity;
    for (const m of pool) for (let i = 0; i < hours; i++) { const v = m.temp[i]; if (v != null) { if (v < tmin) tmin = v; if (v > tmax) tmax = v; } }
    if (!isFinite(tmin)) { tmin = 0; tmax = 20; }
    const step = tmax - tmin > 40 ? 10 : 5;
    const y0 = Math.floor((tmin - 0.5) / step) * step, y1 = Math.ceil((tmax + 0.5) / step) * step;
    const ty = showT ? (v => tBot - (v - y0) / (y1 - y0) * T_H) : null;
    // rain and wind scales
    const PH = showR ? pBot - pTop : 0;
    let rmax = 0, wmax = 0;
    for (let i = 0; i < hours; i++) {
      if (s.rainWet[i].length) rmax = Math.max(rmax, s.rainWet[i][0]);
      if (s.wHi[i] != null) wmax = Math.max(wmax, s.wHi[i]);
    }
    const rTop = RAIN_TICKS.find(v => v >= rmax * 1.05) || Math.ceil(rmax / 20) * 20;
    const py = v => pBot - v / rTop * PH;
    const wTop = WIND_TICKS.find(v => v >= wmax * 1.05) || Math.ceil(wmax / 20) * 20;
    const wy = v => pBot - v / wTop * (PH - 18); // keep the top strip clear for direction arrows

    const o = [];
    panels.forEach(([a, b]) => o.push(`<rect class="bg" x="${LEFT}" y="${a}" width="${plotW}" height="${b - a}"/>`));
    // daylight bands
    for (let d = 0; d < days; d++) {
      const dd = s.days[d];
      if (!dd || dd.rise == null || dd.set == null) continue;
      const x1 = hx(Math.max(0, d * 24 + dd.rise)), x2 = hx(Math.min(hours, d * 24 + dd.set));
      if (x2 <= x1) continue;
      panels.forEach(([a, b]) => o.push(`<rect class="sun" x="${x1}" y="${a}" width="${x2 - x1}" height="${b - a}"/>`));
    }
    // horizontal grids and axis labels
    if (showT) for (let v = y0; v <= y1; v += step) {
      const y = ty(v);
      o.push(`<line class="grid" x1="${LEFT}" x2="${LEFT + plotW}" y1="${y}" y2="${y}"/>`);
      o.push(`<text x="${LEFT - 5}" y="${y + 3.5}" text-anchor="end">${v}°</text>`);
    }
    if (showR) {
      for (let k = 0; k <= 4; k++) {
        const v = rTop * k / 4, y = py(v);
        o.push(`<line class="grid" x1="${LEFT}" x2="${LEFT + plotW}" y1="${y}" y2="${y}"/>`);
        if (k === 2 || k === 4) o.push(`<text x="${LEFT - 5}" y="${y + 3.5}" text-anchor="end">${+v.toFixed(2)}</text>`);
      }
      o.push(`<text class="unit" x="${LEFT + 4}" y="${pTop + 11}">mm/h</text>`);
      if (s.hasWind) {
        for (let k = 1; k <= 2; k++) o.push(`<text class="wax" x="${LEFT + plotW + 5}" y="${wy(wTop * k / 2) + 3.5}">${Math.round(wTop * k / 2)}</text>`);
        o.push(`<text class="unit wax" x="${LEFT + plotW + 5}" y="${pTop + 11}">km/h</text>`);
      }
    }
    // day separators, day labels, hour ticks (under the lower panel)
    const ticks = dayW >= 84 ? [6, 12, 18] : dayW >= 48 ? [12] : [];
    const tickBase = showT ? tBot : pBot;
    for (let d = 0; d < days; d++) {
      const dd = s.days[d], x = hx(d * 24);
      if (d > 0) panels.forEach(([a, b]) => o.push(`<line class="sep" x1="${x}" x2="${x}" y1="${a}" y2="${b}"/>`));
      if (dd) {
        const dt = new Date(dd.date + "T12:00:00"), wk = dt.getDay() === 0 || dt.getDay() === 6;
        const nm = dt.toLocaleDateString(lang, { weekday: dayW >= 70 ? "long" : "short" });
        const cx = hx(Math.min(hours, d * 24 + 12));
        o.push(`<text class="day${wk ? " wk" : ""}" x="${cx}" y="13" text-anchor="middle">${esc(nm)}</text>`);
        o.push(`<text class="${wk ? "wk" : ""}" x="${cx}" y="26" text-anchor="middle">${dd.date.slice(8, 10)}.${dd.date.slice(5, 7)}</text>`);
      }
      for (const h of ticks) if (d * 24 + h < hours) {
        const tx = hx(d * 24 + h);
        o.push(`<line class="grid" x1="${tx}" x2="${tx}" y1="${tickBase}" y2="${tickBase + 4}"/>`);
        o.push(`<text x="${tx}" y="${tickBase + 14}" text-anchor="middle">${String(h).padStart(2, "0")}</text>`);
      }
    }
    if (showR) {
      // rain bars, meteoblue style: one layer per wet model, tallest first; the k-th layer reaches the k-th
      // wettest model's amount and is shaded by k / models, so the dark base is what most models agree on
      const bw = Math.max(1, plotW / hours * 0.8);
      for (let i = 0; i < hours; i++) {
        const wet = s.rainWet[i], n = s.rainN[i];
        if (!wet.length || !n) continue;
        const x = (hx(i + 0.5) - bw / 2).toFixed(1);
        wet.forEach((v, k) => {
          const y = py(Math.min(v, rTop));
          o.push(`<rect x="${x}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(pBot - y).toFixed(1)}" fill="${agreeColor((k + 1) / n)}"/>`);
        });
      }
      // wind: model spread band, mean line, direction arrows (pointing where it blows)
      if (s.hasWind) {
        let top = "", bot = "";
        for (let i = 0; i < hours; i++) if (s.wLo[i] != null) {
          top += `${top ? "L" : "M"}${hx(i + 0.5).toFixed(1)},${wy(s.wHi[i]).toFixed(1)}`;
          bot = `L${hx(i + 0.5).toFixed(1)},${wy(s.wLo[i]).toFixed(1)}` + bot;
        }
        if (top) o.push(`<path class="wband" d="${top}${bot}Z"/>`);
        let wl = "", pen = false;
        for (let i = 0; i < hours; i++) {
          const v = s.wMean[i];
          if (v == null) { pen = false; continue; }
          wl += `${pen ? "L" : "M"}${hx(i + 0.5).toFixed(1)},${wy(v).toFixed(1)}`;
          pen = true;
        }
        o.push(`<path class="wline" d="${wl}"/>`);
        const every = dayW >= 84 ? 3 : dayW >= 48 ? 6 : 12;
        for (let i = Math.floor(every / 2); i < hours; i += every) {
          const d = s.wDir[i], x = hx(i + 0.5);
          if (d == null || x < LEFT + 34 || x > LEFT + plotW - 6) continue;
          o.push(`<path class="warrow" transform="translate(${x.toFixed(1)},${pTop + 9}) rotate(${Math.round(d + 180) % 360})" d="M0,-5L3.6,3.2L0,1.4L-3.6,3.2Z"/>`);
        }
      }
    }
    if (showT) {
      const path = arr => {
        let d = "", pen = false;
        for (let i = 0; i < hours; i++) {
          const v = arr[i];
          if (v == null) { pen = false; continue; }
          d += `${pen ? "L" : "M"}${hx(i + 0.5).toFixed(1)},${ty(v).toFixed(1)}`;
          pen = true;
        }
        return d;
      };
      for (const m of vis) o.push(`<path class="model" stroke="${m.color}" d="${path(m.temp)}"/>`);
      // daily high / low trend: a point per day at the hour the mean peaks (bottoms out), at the median of
      // the models' own daily high (low), joined by a smooth dashed line
      const his = [], los = [];
      for (let d = 0; d < days; d++) {
        const dd = s.days[d];
        if (!dd) continue;
        if (dd.high != null && dd.hiAt != null && dd.hiAt < hours) his.push([hx(dd.hiAt + 0.5), ty(dd.high)]);
        if (dd.low != null && dd.loAt != null && dd.loAt < hours) los.push([hx(dd.loAt + 0.5), ty(dd.low)]);
      }
      o.push(`<path class="trend hi" d="${smooth(his)}"/><path class="trend lo" d="${smooth(los)}"/>`);
      const mp = path(s.mean);
      o.push(`<path class="mean-h" d="${mp}"/><path class="mean" d="${mp}"/>`);
      his.forEach(p => o.push(`<circle class="mk" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.4" fill="${HI_C}"/>`));
      los.forEach(p => o.push(`<circle class="mk" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.4" fill="${LO_C}"/>`));
    }
    // per-day row: high / low under the temperature chart, rain amount and chance under the rain chart
    for (let d = 0; d < days; d++) {
      const dd = s.days[d];
      if (!dd) continue;
      const cx = hx(Math.min(hours, d * 24 + 12)).toFixed(1);
      if (showT && dd.high != null) {
        if (narrow) o.push(`<text class="shi" x="${cx}" y="${hiY - 1}" text-anchor="middle">${Math.round(dd.high)}°</text><text class="slo" x="${cx}" y="${loY}" text-anchor="middle">${Math.round(dd.low)}°</text>`);
        else o.push(`<text x="${cx}" y="${hiY}" text-anchor="middle"><tspan class="shi">${Math.round(dd.high)}°</tspan><tspan dx="6" class="slo">${Math.round(dd.low)}°</tspan></text>`);
      }
      if (showR) {
        if (dd.p >= 0.2 && dd.amt > 0) {
          o.push(`<text class="swet" x="${cx}" y="${rainY}" text-anchor="middle">${dd.amt < 10 ? f1(dd.amt).replace(/\.0$/, "") : Math.round(dd.amt)}${narrow ? "" : " "}mm</text>`);
          o.push(`<text class="sp" x="${cx}" y="${probY}" text-anchor="middle">${narrow ? "" : "chance "}${Math.round(dd.p * 100)}%</text>`);
        } else if (dd.n) o.push(`<text class="sdry" x="${cx}" y="${rainY}" text-anchor="middle">Dry</text>`);
      }
    }
    // now marker
    const nowI = (Date.now() - s.t0) / 3.6e6;
    if (nowI >= 0 && nowI <= hours) {
      const x = hx(nowI);
      panels.forEach(([a, b]) => o.push(`<line class="now" x1="${x}" x2="${x}" y1="${a}" y2="${b}"/>`));
    }
    // scrub layer
    o.push(`<g class="scrubg" style="display:none">${panels.map(([a, b]) => `<line class="scrub" y1="${a}" y2="${b}"/>`).join("")}
      ${showT ? `<circle class="sdot" r="3.5" fill="var(--primary-text-color)"/>` : ""}</g>`);
    const hitTop = panels[0][0], hitBot = panels[panels.length - 1][1];
    o.push(`<rect class="hit" x="${LEFT}" y="${hitTop}" width="${plotW}" height="${hitBot - hitTop}" fill="transparent"/>`);
    return { svg: `<svg viewBox="0 0 ${W} ${H}" height="${H}">${o.join("")}</svg>`, geo: { hours, plotW, hx, ty, W } };
  }

  // Land advice: plain rules over the whole 7-day consensus, most urgent first (frost, heavy rain, gales
  // and heat), then power, watering and mushrooms, then gentler nudges. At most ADVICE_MAX lines.
  _advice(days, lang, past) {
    if (!days.length || days[0].high == null) return [];
    const today = new Date(), tom = new Date(Date.now() + 864e5), iso = d => d.toLocaleDateString("sv");
    const name = d => d.date === iso(today) ? "today" : d.date === iso(tom) ? "tomorrow"
      : new Date(d.date + "T12:00:00").toLocaleDateString(lang, { weekday: "long" });
    const span = (a, b) => a === b ? name(days[a]) : `${name(days[a])} to ${name(days[b])}`;
    // short day for the keyword tags: today, tomorrow, then Wed, Thu…
    const sday = i => { const n = name(days[i]); return n === "today" || n === "tomorrow" ? n
      : new Date(days[i].date + "T12:00:00").toLocaleDateString(lang, { weekday: "short" }); };
    const r = Math.round, out = [], add = (pri, at, text, kind, tag, detail) => out.push({ pri, at, text, kind, tag, detail });
    const runs = test => {
      const res = [];
      days.forEach((d, i) => {
        if (!test(d, i)) return;
        const l = res[res.length - 1];
        if (l && l.b === i - 1) l.b = i; else res.push({ a: i, b: i });
      });
      return res;
    };
    const wet = d => d.p >= 0.6 && d.amt >= WET_DAY;
    const peak = (run, key) => r(Math.max(...days.slice(run.a, run.b + 1).map(d => d[key])));

    // urgent: frost, heavy rain, gales, heat
    const fi = days.findIndex(d => d.low != null && d.low <= LAND.frost);
    if (fi >= 0) {
      const l = r(days[fi].low);
      add(1, fi, l <= 0 ? `Frost likely early ${name(days[fi])} (${l}°): cover seedlings and bring tender pots in.`
        : `Near frost early ${name(days[fi])} (${l}°): fleece the seedlings.`, "frost", `Frost ${sday(fi)}`);
    }
    const heavy = runs(d => wet(d) && d.amt >= LAND.heavyRain);
    if (heavy.length) {
      // reported amount = expected total (amount × share of models), the same figure the summary uses
      const h = heavy[0], mm = r(days.slice(h.a, h.b + 1).reduce((t, d) => t + d.amt * d.p, 0)), month = today.getMonth() + 1;
      add(1, h.a, `Heavy rain ${span(h.a, h.b)} (about ${mm} mm): ${month >= 9 && month <= 11 ? "clear the gutters, " : ""}tarp timber and tools, cover the compost.`, "rain", `Heavy rain ${sday(h.a)}`);
    }
    const gale = runs(d => d.gust != null && d.gust >= LAND.gale);
    if (gale.length) add(1, gale[0].a, `Strong gusts ${span(gale[0].a, gale[0].b)} (to ${peak(gale[0], "gust")} km/h): tie down tarps, the yurt cover and anything loose.`, "wind", `Gusts ${sday(gale[0].a)}`);
    const hot = runs(d => d.high != null && d.high >= LAND.hot);
    if (hot.length) add(1, hot[0].a, `Hot ${span(hot[0].a, hot[0].b)} (up to ${peak(hot[0], "high")}°): water early in the morning and shade young plants.`, "heat", `Hot ${sday(hot[0].a)}`);

    // pump: the creek runs muddy in and after heavy rain, so pump before rain or once the creek runs clear.
    // With a silo level sensor (option silo: sensor entity in %, silo_low default 40) a low silo gets its own line.
    const sid = this._c.silo, st = sid && this._hass && this._hass.states[sid];
    const silo = st && !isNaN(parseFloat(st.state)) ? parseFloat(st.state) : null;
    const rainSoon = days.findIndex((d, i) => i <= 2 && wet(d) && d.amt * d.p >= LAND.rainDue);
    if (silo != null && silo < this._c.silo_low) {
      const lvl = `Silo at ${r(silo)}%`;
      if (rainSoon === 0) add(1, 0, `${lvl} and rain today: hold the pump until the creek runs clear, then top up.`, "water", lvl);
      else if (rainSoon > 0) add(1, 0, `${lvl} with rain due ${name(days[rainSoon])}: pump before then, or wait until the creek runs clear after.`, "water", lvl);
      else add(2, 0, `${lvl}: run the pump once you've checked the creek is running clear.`, "water", lvl);
    } else if (heavy.length) {
      add(2, heavy[0].a, `Pump: keep it off in the heavy rain ${span(heavy[0].a, heavy[0].b)}, then check the creek runs clear before pumping again.`, "water", `Pump off ${sday(heavy[0].a)}`);
    }

    // power: two or more dull days in a row, or else a bright stretch worth using
    const sunVals = days.map(d => d.sun).filter(v => v != null), best = sunVals.length ? Math.max(...sunVals) : 0;
    if (best > 0) {
      const dull = runs(d => d.sun != null && (d.sun < LAND.dullAbs || d.sun < best * LAND.dullFrac)).filter(x => x.b > x.a);
      if (dull.length) {
        const u = dull[0], next = days.findIndex((d, i) => i > u.b && d.sun != null && d.sun >= best * 0.7);
        const tip = u.a > 0 ? `run the pump and power tools ${u.a === 1 ? "today" : "by " + name(days[u.a - 1])}`
          : next >= 0 ? `save pumping and power tools for ${name(days[next])}` : "keep big loads to a minimum";
        add(2, u.a, `Little sun ${span(u.a, u.b)}: go easy on the battery, ${tip}.`, "power", `Low sun ${sday(u.a)}`);
      } else if (best >= LAND.brightMin) {
        const br = runs(d => d.sun != null && d.sun >= best * LAND.brightFrac).filter(x => x.b > x.a);
        if (br.length) add(3, br[0].a, `Bright ${span(br[0].a, br[0].b)}: good days for pumping, power tools and charging.`, "power", `Bright ${sday(br[0].a)}`);
      }
    }

    // water: a dry, warm spell starting soon, or rain on its way
    const dry = runs(d => d.n && d.p < 0.3 && d.high != null && d.high >= LAND.dryHigh).filter(x => x.b - x.a + 1 >= LAND.dryRun);
    if (dry.length && dry[0].a <= 2) {
      const d0 = dry[0], scorching = days.slice(d0.a, d0.b + 1).some(d => d.high >= 28);
      add(2, d0.a, hot.length ? `Dry ${span(d0.a, d0.b)}: mulch bare soil and keep the silo topped up.`
        : `Dry and warm ${span(d0.a, d0.b)}: water seedlings in the ${scorching ? "early morning" : "evening"} and mulch bare soil.`, "plant", "Dry spell");
    }
    if (!heavy.length) {
      const ri = days.findIndex((d, i) => i <= 2 && wet(d) && d.amt * d.p >= LAND.rainDue);
      if (ri >= 0) add(3, ri, `Rain due ${name(days[ri])} (about ${r(days[ri].amt * days[ri].p)} mm): hold off watering.`, "rain", `Rain ${sday(ri)}`, `about ${r(days[ri].amt * days[ri].p)} mm, hold off watering`);
    }

    // soil: a mild, dry day straight after rain is a planting window
    for (let i = 1; i < days.length; i++) {
      const prev = days[i - 1], d = days[i];
      if (wet(prev) && d.p < 0.3 && d.high != null && d.high >= 12 && d.high <= 24 && d.low != null && d.low >= 5) {
        add(3, i, `Moist soil after ${name(prev)}'s rain: ${name(d)} is a good day to plant out or sow.`, "plant", `Plant ${sday(i)}`, `moist soil after ${name(prev)}'s rain`);
        break;
      }
    }
    // mushrooms: find soaking rains across the last 14 days (measured) and the next 7 (forecast, expected mm)
    const DAY = 864e5, base = Date.parse(days[0].date + "T12:00:00");
    const series = [];
    if (past && past.time && past.precipitation_sum) past.time.forEach((d, i) => {
      const rel = Math.round((Date.parse(d + "T12:00:00") - base) / DAY);
      if (rel < 0) series.push({ rel, mm: past.precipitation_sum[i] || 0 });
    });
    days.forEach((d, i) => series.push({ rel: i, mm: d.p >= 0.3 ? d.amt * d.p : 0 }));
    const soaks = [];
    let cur = null;
    series.forEach(x => {
      if (x.mm < 3) { cur = null; return; }
      if (cur && cur.end === x.rel - 1) { cur.end = x.rel; cur.mm += x.mm; } else { cur = { start: x.rel, end: x.rel, mm: x.mm }; soaks.push(cur); }
    });
    const soaked = soaks.filter(e => e.mm >= LAND.soak);
    const when = rel => rel >= 0 && rel < days.length ? name(days[rel])
      : new Date(base + rel * DAY).toLocaleDateString(lang, { day: "numeric", month: "short" });
    const rainLabel = e => e.end < 0 ? `the ${when(e.start)} rain` : `${when(e.start)}'s rain`;
    const mild = d => d.high != null && d.low != null && d.low > LAND.frost && d.high >= 8 && d.high <= 26;
    // a window [from, to] (days after a soak) clipped to the forecast, keeping only mild, frost-free days
    const windowIn = (e, from, to) => {
      const a = Math.max(0, e.end + from), b = Math.min(days.length - 1, e.end + to);
      if (a > b) return null;
      const ok = []; for (let i = a; i <= b; i++) if (mild(days[i])) ok.push(i);
      return ok.length ? { a: ok[0], b: ok[ok.length - 1] } : null;
    };
    // woods (autumn): porcini, chanterelles, parasols and saffron milk caps a week or two after a soaking
    if (LAND.forageMonths.includes(today.getMonth() + 1)) {
      let done = false;
      for (const e of [...soaked].reverse()) {
        const w = windowIn(e, LAND.forageFrom, LAND.forageTo);
        if (!w) continue;
        add(2, w.a, `Foraging ${span(w.a, w.b)}, a week or two after ${rainLabel(e)}: porcini and chanterelles under oak and chestnut, parasols in clearings, saffron milk caps under pine. Pick only what you know for certain.`, "mushroom", w.a === 0 ? "Foraging" : `Foraging ${sday(w.a)}`);
        done = true;
        break;
      }
      const ahead = soaked.find(e => e.start >= 0 && e.end + LAND.forageFrom > days.length - 1);
      if (!done && ahead) add(3, ahead.start, `${rainLabel(ahead).replace(/^./, c => c.toUpperCase())} (about ${r(ahead.mm)} mm) should bring woodland mushrooms up from around ${when(ahead.end + LAND.forageFrom)}.`, "mushroom", "Mushrooms soon");
    }
    // shiitake logs (open air, rain-fed): expect fruiting a few days after a decent rain
    for (const e of [...soaks].reverse()) {
      if (e.mm < LAND.logRain) continue;
      const w = windowIn(e, LAND.farmFrom, LAND.farmTo);
      if (!w) continue;
      add(2, w.a, `Shiitake logs: likely fruiting ${span(w.a, w.b)}, a few days after ${rainLabel(e)}. Pick while the caps are still curled under.`, "mushroom", w.a === 0 ? "Shiitake" : `Shiitake ${sday(w.a)}`);
      break;
    }
    return out.sort((x, y) => x.pri - y.pri || x.at - y.at);
  }

  // One or two plain sentences, built from the daily figures: rain first, then temperatures.
  _summary(days, lang) {
    if (!days.length || days[0].high == null) return "";
    const today = new Date(), tom = new Date(Date.now() + 864e5), iso = d => d.toLocaleDateString("sv");
    const name = d => d.date === iso(today) ? "today" : d.date === iso(tom) ? "tomorrow"
      : new Date(d.date + "T12:00:00").toLocaleDateString(lang, { weekday: "long" });
    const span = (a, b) => a === b ? name(days[a]) : `${name(days[a])} to ${name(days[b])}`;
    const cls = d => d.p >= 0.6 && d.amt >= WET_DAY ? "rain" : d.p >= 0.3 ? "maybe" : "dry";
    const runs = [];
    days.forEach((d, i) => {
      const c = cls(d), last = runs[runs.length - 1];
      if (last && last.c === c) last.b = i; else runs.push({ c, a: i, b: i });
    });
    const mm = (a, b) => Math.round(days.slice(a, b + 1).reduce((t, d) => t + (d.p >= 0.3 ? d.amt * d.p : 0), 0));
    const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
    const sentences = [];
    if (runs.length === 1 && runs[0].c === "dry") sentences.push(`Dry for the next ${days.length} days.`);
    else {
      let rest = runs;
      if (runs[0].c === "dry") {
        sentences.push(`Dry ${runs[0].b === 0 ? name(days[0]) : `until ${name(days[runs[0].b])}`}.`);
        rest = runs.slice(1);
      }
      const bits = rest.map((r, i) => r.c === "rain"
        ? `rain likely ${span(r.a, r.b)}${mm(r.a, r.b) >= 1 ? ` (about ${mm(r.a, r.b)} mm)` : ""}`
        : r.c === "maybe" ? `showers possible ${span(r.a, r.b)}`
        : i === rest.length - 1 ? `dry again from ${name(days[r.a])}` : null).filter(Boolean);
      if (bits.length) sentences.push(cap(bits.join(", ")) + ".");
    }
    // wind: name runs of days where the models' typical peak gust reaches WINDY
    const windy = [];
    days.forEach((d, i) => {
      if (d.gust == null || d.gust < WINDY) return;
      const last = windy[windy.length - 1];
      if (last && last.b === i - 1) { last.b = i; last.g = Math.max(last.g, d.gust); } else windy.push({ a: i, b: i, g: d.gust });
    });
    if (windy.length) sentences.push(cap(windy.map(w => `windy ${span(w.a, w.b)} (gusts to ${Math.round(w.g)} km/h)`).join(", ")) + ".");
    // temperatures: name a mid-week peak or dip when there is one, otherwise the overall trend
    const idx = days.map((d, i) => i).filter(i => days[i].high != null);
    const r = Math.round, H = i => r(days[i].high), first = idx[0], last = idx[idx.length - 1];
    const iMax = idx.reduce((a, i) => days[i].high > days[a].high ? i : a, first);
    const iMin = idx.reduce((a, i) => days[i].high < days[a].high ? i : a, first);
    let temp;
    if (iMax !== first && iMax !== last && H(iMax) - H(first) >= 2 && H(iMax) - H(last) >= 3)
      temp = `Highs peak at ${H(iMax)}° ${name(days[iMax])}, then fall to ${H(last)}° by ${name(days[last])}`;
    else if (iMin !== first && iMin !== last && H(first) - H(iMin) >= 2 && H(last) - H(iMin) >= 3)
      temp = `Highs dip to ${H(iMin)}° ${name(days[iMin])}, then recover to ${H(last)}° by ${name(days[last])}`;
    else if (Math.abs(H(last) - H(first)) >= 3)
      temp = `Highs ${H(last) > H(first) ? "rising" : "falling"} from ${H(first)}° to ${H(last)}° by ${name(days[last])}`;
    else temp = `Highs steady around ${r(Math.min(...idx.map(i => days[i].high)))}–${r(Math.max(...idx.map(i => days[i].high)))}°`;
    const lows = idx.map(i => days[i].low), iCold = idx.reduce((a, i) => days[i].low < days[a].low ? i : a, first);
    temp += r(days[iCold].low) <= 5 ? `; coldest night ${name(days[iCold])} at ${r(days[iCold].low)}°.` : `; lows ${r(Math.min(...lows))}–${r(Math.max(...lows))}°.`;
    sentences.push(temp);
    return sentences.join(" ");
  }

  _wireScrub(plot, svg, G) {
    const hit = svg.querySelector(".hit"), g = svg.querySelector(".scrubg"), tip = plot.querySelector(".tip");
    const lines = g.querySelectorAll("line"), dot = g.querySelector("circle");
    const s = this._s;
    const show = e => {
      clearTimeout(this._hideT);
      plot.querySelectorAll(".scrubg").forEach(x => { if (x !== g) x.style.display = "none"; });
      const r = svg.getBoundingClientRect(), pr = plot.getBoundingClientRect(), x = (e.clientX - r.left) * (G.W / r.width);
      const i = Math.max(0, Math.min(G.hours - 1, Math.floor((x - LEFT) / G.plotW * G.hours)));
      const cx = G.hx(i + 0.5);
      lines.forEach(l => { l.setAttribute("x1", cx); l.setAttribute("x2", cx); });
      const m = s.mean[i];
      if (dot) { if (m != null && G.ty) { dot.setAttribute("cx", cx); dot.setAttribute("cy", G.ty(m)); dot.style.display = ""; } else dot.style.display = "none"; }
      g.style.display = "";
      const t = new Date(s.times[i] + ":00");
      const lang = (this._hass && this._hass.locale && this._hass.locale.language) || "en";
      const when = t.toLocaleDateString(lang, { weekday: "short" }) + " " + s.times[i].slice(11, 16);
      const hit_ = s.rainHit[i], n = s.rainN[i], wet = s.rainWet[i];
      const mid = wet.length ? wet[Math.floor(wet.length / 2)] : 0;
      const rain = hit_ ? `Rain in ${hit_} of ${n} models <span class="dim">· typical ${f1(mid)}, up to ${f1(wet[0])} mm/h</span>` : `<span class="dim">Dry in all ${n} models</span>`;
      const wv = s.wMean[i], wd = s.wDir[i], gv = s.gMed[i];
      const wind = wv != null ? `<br>Wind ${Math.round(wv)} km/h${wd != null ? " " + COMPASS[Math.round(wd / 45) % 8] : ""}${gv != null ? ` <span class="dim">· gusts ${Math.round(gv)}</span>` : ""}` : "";
      tip.innerHTML = `<b>${esc(when)}</b><br>${m != null ? Math.round(m) + "°" : "—"} <span class="dim">mean · ${s.lo[i] != null ? Math.round(s.lo[i]) : "—"}–${s.hi[i] != null ? Math.round(s.hi[i]) : "—"}°</span><br>${rain}${wind}`;
      tip.style.display = "block";
      // position next to the line, inside the plot area, flipping left near the right edge
      const off = r.left - pr.left, px = off + cx * (r.width / G.W), tw = tip.offsetWidth;
      tip.style.left = Math.max(0, px + 12 + tw > pr.width ? px - 12 - tw : px + 12) + "px";
    };
    const hide = delay => { clearTimeout(this._hideT); this._hideT = setTimeout(() => { g.style.display = "none"; tip.style.display = "none"; }, delay); };
    hit.addEventListener("pointerdown", e => { show(e); });
    hit.addEventListener("pointermove", e => { if (e.pointerType === "mouse" || e.buttons || e.pressure > 0) show(e); });
    hit.addEventListener("pointerup", e => { if (e.pointerType !== "mouse") hide(3000); });
    hit.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") hide(0); });
    hit.addEventListener("pointercancel", () => hide(1500));
  }

  _renderLegend() {
    const el = this.shadowRoot.querySelector(".legend"), s = this._s;
    el.innerHTML = `<span class="chip static"><span class="sw mean"></span>Mean</span><span class="chip static"><span class="sw hi"></span>Daily high</span>`
      + `<span class="chip static"><span class="sw lo"></span>Daily low</span>`
      + (s.hasWind ? `<span class="chip static"><span class="sw wind"></span>Wind</span>` : "")
      + (this._c.show_models ? s.models.map(m =>
      `<span class="chip${this._hidden.has(m.id) ? " off" : ""}" data-id="${esc(m.id)}"><span class="sw" style="background:${m.color}"></span>${esc(m.name)}</span>`).join("") : "");
    el.querySelectorAll(".chip[data-id]").forEach(c => c.addEventListener("click", e => {
      e.stopPropagation();
      const id = c.dataset.id;
      if (this._hidden.has(id)) this._hidden.delete(id); else this._hidden.add(id);
      this._render();
    }));
  }

  _renderMeta() {
    const el = this.shadowRoot.querySelector(".meta");
    if (!el) return;
    const s = this._s;
    const hhmm = t => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    if (!s) { el.textContent = this._err ? "Forecast unavailable (" + this._err + ")" : ""; if (this._err) this.shadowRoot.querySelector(".plot").innerHTML = `<div class="empty">Forecast unavailable right now</div>`; return; }
    const age = this._ts ? Date.now() - this._ts : 0;
    el.textContent = `Open-Meteo · ${s.models.length} models · ` + (this._err && age > 90 * 60e3 ? `offline, showing ${hhmm(this._ts)} forecast` : `updated ${hhmm(this._ts)}`);
  }
}

if (!customElements.get("corujeira-meteogram-card")) customElements.define("corujeira-meteogram-card", CorujeiraMeteogramCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === "corujeira-meteogram-card"))
  window.customCards.push({ type: "corujeira-meteogram-card", name: "A Corujeira meteogram", description: "Multi-model temperature and rain forecast from Open-Meteo." });
})();

// ---- corujeira-mirror-strategy.js
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
    // the grid that holds the sections (in HA 2026.9 a .content grid inside ha-sortable, not the outer container)
    const grids = root ? [...root.querySelectorAll("*")].filter(e => getComputedStyle(e).display === "grid") : [];
    let grid = null, secs = [];
    for (const g of grids) {
      const kids = [...g.children].filter(e => e.offsetHeight > 0 && this.find(e, "hui-grid-section"));
      if (kids.length > secs.length) { grid = g; secs = kids; }
    }
    if (!grid) return;
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

// ---- corujeira-silo-card.js
/* A Corujeira silo card: a drawing of the water tank that fills to the current level, with the percentage inside,
   litres beside it, and optionally the pump that fills it (on/off switch, run-time pills, countdown).
   Options:
     entity:     level sensor in %, where 100% = full storage (required)
     volume:     volume sensor in L (optional; otherwise worked out from capacity)
     capacity:   litres at 100% (default 5000)
     headroom:   how far above 100% the tank drawing goes, in % (default 24: the dome above the stored water)
     distance:   sensor for distance from the level sensor to the water (optional, shown on wide screens)
     name:       title (default "Water Silo")
     color:      water colour (default #4AA8D8)
     low:        % at or below which the figure turns warning red (default 20)
     pump:       switch entity for the pump (optional; adds the pump row)
     pump_name:  default "Creek Pump"
     pump_timer: timer entity that counts the run down (optional)
     pump_run_time: input_select of run times such as "30 min" (optional, shown as pills)
     pump_power: power sensor of the pump (optional, shown while running)
     pump_icon:  default corujeira:creek-pump
     creek:      input_boolean that says the creek has been checked and is running clear (optional, shown under the pump;
                 on = clear, off = check it after rain)
     creek_name: default "Creek"
     read_only:  true shows the pump and creek as status only: no switches, no run-time pills, no pop-ups (default false)
     ink:        line colour of the drawing (default a soft charcoal: the theme's text colour, softened)
     tap_action: { action: more-info | navigate | none, navigation_path } (default more-info on entity); applies to the tank and figures
   Remove this resource to revert. */
(() => {
const FULL_LINE = 268, BOTTOM = 770;  // y where the dome meets the walls and the tank floor in the drawing's viewBox
const fmt = n => Math.round(n).toLocaleString("en-GB");

// ---- Hand-drawn ink, in the style of the A Corujeira icons: each line is a filled brush stroke whose width swells
// and thins along its length, wanders slightly off its path and tapers to rounded ends. Seeded, so it never changes.
const rng = s => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// Catmull-Rom spline through hand-placed points, sampled about every `step` units.
function spline(pts, closed, step = 5) {
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]], out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [a, b, c, d] = [P[i - 1], P[i], P[i + 1], P[i + 2]], n = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t, f = (p0, p1, p2, p3) =>
        .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      out.push([f(a[0], b[0], c[0], d[0]), f(a[1], b[1], c[1], d[1])]);
    }
  }
  out.push(closed ? out[0] : pts[pts.length - 1]);
  return out;
}
const f1 = n => n.toFixed(1);
function brush(pts, w, seed, { taper = .5, wobble = 1.6 } = {}) {
  const S = spline(pts, false), r = rng(seed), len = [0];
  for (let i = 1; i < S.length; i++) len.push(len[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]));
  const L = len[len.length - 1], ph = [r(), r(), r(), r()].map(x => x * 6.283), TAU = 6.283;
  const c1 = L / (260 + r() * 140), c2 = L / (140 + r() * 60), c3 = L / (360 + r() * 140), c4 = L / (180 + r() * 60);
  const lft = [], rgt = [], wid = [];
  S.forEach((p, i) => {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
    const nx = -dy / m, ny = dx / m, s = len[i] / L;
    const end = Math.min(1, s / .1, (1 - s) / .1), ease = end * end * (3 - 2 * end);
    const wv = w * (1 + .16 * Math.sin(TAU * s * c1 + ph[0]) + .07 * Math.sin(TAU * s * c2 + ph[1])) * (taper + (1 - taper) * ease);
    const off = wobble * (.7 * Math.sin(TAU * s * c3 + ph[2]) + .3 * Math.sin(TAU * s * c4 + ph[3]));
    const cx = p[0] + nx * off, cy = p[1] + ny * off;
    lft.push(`${f1(cx + nx * wv / 2)} ${f1(cy + ny * wv / 2)}`);
    rgt.push(`${f1(cx - nx * wv / 2)} ${f1(cy - ny * wv / 2)}`);
    wid.push([cx, cy, wv / 2]);
  });
  const dot = ([x, y, q]) => `M${f1(x - q)} ${f1(y)}a${f1(q)} ${f1(q)} 0 1 0 ${f1(2 * q)} 0a${f1(q)} ${f1(q)} 0 1 0 ${f1(-2 * q)} 0Z`;
  return `M${lft.join("L")}L${rgt.reverse().join("L")}Z${dot(wid[0])}${dot(wid[wid.length - 1])}`;
}
// The tank's outline, as hand-placed points running clockwise from the top-left corner of the raised top.
const BODY = [[226, 168], [370, 165], [506, 168], [511, 176], [620, 176], [724, 179], [805, 187], [880, 198], [882, 234], [884, 266],
  [904, 286], [930, 320], [938, 390], [939, 560], [937, 725], [925, 765], [893, 778], [700, 781], [552, 779], [400, 781], [205, 778],
  [175, 765], [163, 725], [161, 560], [162, 390], [170, 320], [196, 286], [222, 266], [224, 220]];
const ring = (cx, cy, r, from = -1.4) => Array.from({ length: 11 }, (_, i) => {
  const a = from + i * 6.6 / 10; return [cx + r * Math.cos(a) * (1 + .03 * Math.sin(i * 2.1)), cy + r * Math.sin(a)]; });
let DRAWING;
function drawing() {
  if (DRAWING) return DRAWING;
  const clip = spline(BODY, true, 8).map(([x, y], i) => `${i ? "L" : "M"}${f1(x)} ${f1(y)}`).join("") + "Z";
  const ink = [
    brush([...BODY, [226, 168], [330, 166]], 11, 11, { taper: .75 }),                                 // outline, overshooting where it closes
    brush([[230, 267], [420, 270], [600, 266], [878, 269]], 7, 12, { taper: .4 }),                   // collar
    brush([[236, 258], [360, 220], [500, 183]], 6, 13, { taper: .3 }),                                // shading on the top
    brush([[618, 184], [790, 202], [872, 256]], 6, 14, { taper: .3 }),
    brush(ring(552, 224, 29), 7, 15, { taper: .6 }),                                                  // inlet
    brush([[250, 166], [254, 140], [262, 136], [262, 122], [356, 116], [452, 120], [454, 134], [472, 138], [476, 166]], 9, 21), // lid
    brush([[176, 470], [360, 487], [552, 493], [744, 486], [926, 468]], 6, 31, { taper: .3 }),       // ribs
    brush([[176, 650], [360, 667], [552, 673], [744, 666], [926, 648]], 6, 33, { taper: .3 }),
    brush([[503, 775], [502, 724], [518, 696], [552, 687], [586, 695], [602, 722], [601, 775]], 7, 41), // outlet
    brush([[150, 811], [300, 809], [470, 813], [640, 809], [810, 812], [952, 809]], 9, 51, { taper: .25 }), // ground
  ];
  const lid = spline([[252, 166], [255, 140], [263, 136], [263, 123], [356, 117], [451, 121], [453, 135], [471, 139], [474, 166]], true, 6)
    .map(([x, y], i) => `${i ? "L" : "M"}${f1(x)} ${f1(y)}`).join("") + "Z";
  return (DRAWING = { clip, lid, ink: ink.join("") });
}
const mmss = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };

class CorujeiraSiloCard extends HTMLElement {
  setConfig(c) {
    if (!c || !c.entity) throw new Error("corujeira-silo-card: entity is required");
    this._c = { name: "Water Silo", color: "#4AA8D8", low: 20, capacity: 5000, headroom: 24,
      pump_name: "Creek Pump", pump_icon: "corujeira:creek-pump", ...c };
    // 100% sits below the collar line so the dome above it reads as headroom, not storage.
    this._top = BOTTOM - (BOTTOM - FULL_LINE) * 100 / (100 + this._c.headroom);
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const col = this._c.color, pump = !!this._c.pump, ro = !!this._c.read_only, D = drawing(), ink = this._c.ink || "color-mix(in srgb, var(--primary-text-color) 68%, var(--card-background-color, #fff))";
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { padding:14px 16px 14px 12px; font-family:'Lato',sans-serif; }
        .row { display:flex; align-items:center; gap:16px; }
        .hit { cursor:pointer; -webkit-tap-highlight-color:transparent; }
        svg { flex:none; height:136px; width:auto; overflow:visible; }
        .ink { stroke:var(--primary-text-color); fill:none; stroke-linecap:round; stroke-linejoin:round; }
        .solid { fill:${ink}; }
        .wash { fill:${ink}; opacity:.35; }
        .water { fill:${col}; }
        .crest { fill:color-mix(in srgb, ${col} 55%, #fff); }
        .max { stroke:color-mix(in srgb, ${ink} 45%, transparent); stroke-width:6; stroke-linecap:round; stroke-dasharray:20 18 30 16 14 20 26 17; fill:none; }
        .stream { stroke:${col}; stroke-width:16; stroke-linecap:round; stroke-dasharray:26 22; fill:none; opacity:0; transition:opacity .4s; animation:pour .7s linear infinite; }
        .on .stream { opacity:.9; }
        @keyframes pour { to { stroke-dashoffset:-48; } }
        .pct { font:700 150px 'Lato',sans-serif; text-anchor:middle; letter-spacing:-4px; }
        .pct.dark { fill:var(--primary-text-color); }
        .pct.light { fill:#fff; }
        .pct.low.dark { fill:#C2574A; }
        .wave { animation:drift 6s linear infinite; }
        .wave.b { animation-duration:9s; animation-direction:reverse; }
        @keyframes drift { from { transform:translateX(0); } to { transform:translateX(-200px); } }
        @media (prefers-reduced-motion: reduce) { .wave, .stream { animation:none; } }
        .level { transition:transform 1.2s cubic-bezier(.3,.7,.3,1); }
        .right { flex:1; min-width:0; display:flex; flex-direction:column; gap:10px; }
        .info { display:flex; flex-direction:column; gap:2px; }
        .name { font-size:14px; font-weight:700; color:var(--primary-text-color); }
        .litres { font-size:28px; font-weight:700; line-height:1.1; color:var(--primary-text-color); margin-top:4px; }
        .litres span { font-size:16px; font-weight:400; margin-left:2px; }
        .sub { font-size:13px; color:var(--secondary-text-color); }
        .dist { display:none; }
        @media (min-width:1024px) { .dist { display:block; } }
        .pump { border-top:1px solid var(--divider-color, rgba(84,98,108,.2)); padding-top:10px; display:flex; flex-direction:column; gap:8px; }
        .ptop { display:flex; align-items:center; gap:8px; }
        .ptop ha-icon { --mdc-icon-size:22px; color:var(--primary-text-color); flex:none; }
        .pname { font-size:14px; font-weight:700; color:var(--primary-text-color); line-height:1.15; cursor:pointer; }
        .pstate { font-size:12.5px; color:var(--secondary-text-color); font-variant-numeric:tabular-nums; }
        .pstate.run { color:color-mix(in srgb, ${col} 80%, #000); font-weight:700; }
        .ptext { flex:1; min-width:0; }
        .sw { all:unset; flex:none; position:relative; width:58px; height:32px; border-radius:999px; cursor:pointer; box-sizing:border-box;
          background:color-mix(in srgb, var(--primary-text-color) 18%, transparent); transition:background .2s; -webkit-tap-highlight-color:transparent; }
        .sw::after { content:""; position:absolute; top:3px; left:3px; width:26px; height:26px; border-radius:50%; background:#fff;
          box-shadow:0 1px 3px rgba(0,0,0,.3); transition:transform .2s cubic-bezier(.3,.7,.3,1); }
        .sw[aria-checked="true"] { background:${col}; }
        .sw[aria-checked="true"]::after { transform:translateX(26px); }
        .sw:focus-visible { outline:2px solid ${col}; outline-offset:2px; }
        .sw:disabled { cursor:not-allowed; opacity:.45; }
        .pills { display:flex; gap:4px; flex-wrap:wrap; }
        .pills button { all:unset; box-sizing:border-box; cursor:pointer; font-size:12.5px; font-weight:700; line-height:1; padding:7px 10px; border-radius:999px;
          color:var(--secondary-text-color); background:color-mix(in srgb, var(--primary-text-color) 7%, transparent); transition:background .15s, color .15s, transform .1s;
          -webkit-tap-highlight-color:transparent; }
        .pills button:active { transform:scale(.94); }
        .pills button:focus-visible { outline:2px solid ${col}; outline-offset:1px; }
        .pills button.on { background:color-mix(in srgb, ${col} 85%, #000); color:#fff; cursor:default; }
        .creek { padding-top:2px; }
        .creek ha-icon { --mdc-icon-size:20px; }
        .creek .pstate.check { color:#B9772C; font-weight:700; }
        .sw.small { width:46px; height:26px; }
        .sw.small::after { width:20px; height:20px; }
        .sw.small[aria-checked="true"]::after { transform:translateX(20px); }
        .ro .pname { cursor:default; }
      </style>
      <ha-card>
        <div class="row">
          <svg class="hit tank" viewBox="140 100 820 730" role="img" aria-label="Silo level">
            <defs>
              <clipPath id="inside"><path d="${D.clip}"/></clipPath>
              <mask id="wet" maskUnits="userSpaceOnUse" x="140" y="100" width="820" height="730"><g class="level"><path class="wave" fill="#fff" d="${this._wave(0)}"/></g></mask>
            </defs>
            <g clip-path="url(#inside)">
              <g class="level">
                <path class="crest wave b" d="${this._wave(1)}"/>
                <path class="water wave" d="${this._wave(0)}"/>
              </g>
              ${pump ? `<path class="stream" d="M552 256 V780"/>` : ""}
              <path class="max" d="M150 ${this._top.toFixed(0)} H950"/>
            </g>
            <path class="wash" d="${D.lid}"/>
            <path class="solid" d="${D.ink}"/>
            <text class="pct dark" x="552" y="628"></text>
            <g clip-path="url(#inside)"><text class="pct light" x="552" y="628" mask="url(#wet)"></text></g>
          </svg>
          <div class="right">
            <div class="info hit">
              <div class="name"></div>
              <div class="litres"></div>
              <div class="sub cap"></div>
              <div class="sub dist"></div>
            </div>
            ${pump ? `
            <div class="pump${ro ? " ro" : ""}">
              <div class="ptop">
                <ha-icon></ha-icon>
                <div class="ptext"><div class="pname"></div><div class="pstate"></div></div>
                ${ro ? "" : `<button class="sw" role="switch" aria-checked="false"></button>`}
              </div>
              ${ro ? "" : `<div class="pills"></div>`}
              ${this._c.creek ? `
              <div class="ptop creek">
                <ha-icon icon="mdi:waves"></ha-icon>
                <div class="ptext"><div class="pname cname"></div><div class="pstate cstate"></div></div>
                ${ro ? "" : `<button class="sw small csw" role="switch" aria-checked="false"></button>`}
              </div>` : ""}
            </div>` : ""}
          </div>
        </div>
      </ha-card>`;
    const r = this.shadowRoot, q = s => r.querySelector(s);
    this._el = { svg: q("svg"), levels: r.querySelectorAll(".level"), pcts: r.querySelectorAll(".pct"), name: q(".name"),
      litres: q(".litres"), cap: q(".cap"), dist: q(".dist"), sw: q(".sw"), stream: q(".stream"), pstate: q(".pstate"), pills: q(".pills"),
      csw: q(".csw"), cstate: q(".cstate"), cname: q(".cname") };
    this._el.name.textContent = this._c.name;
    const open = () => this._tap();
    [q(".tank"), q(".info")].forEach(el => el.addEventListener("click", open));
    if (pump) {
      q(".ptop ha-icon").setAttribute("icon", this._c.pump_icon);
      q(".pname").textContent = this._c.pump_name;
      if (this._el.cname) this._el.cname.textContent = this._c.creek_name || "Creek";
    }
    if (pump && !ro) {
      q(".pname").addEventListener("click", () => this._more(this._c.pump));
      this._el.sw.setAttribute("aria-label", this._c.pump_name);
      this._el.sw.addEventListener("click", e => {
        e.stopPropagation();
        const on = this._el.sw.getAttribute("aria-checked") === "true";
        this._hass.callService("switch", on ? "turn_off" : "turn_on", { entity_id: this._c.pump });
      });
      if (this._el.csw) {
        const cname = this._c.creek_name || "Creek";
        q(".cname").addEventListener("click", () => this._more(this._c.creek));
        this._el.csw.setAttribute("aria-label", `${cname} clear`);
        this._el.csw.addEventListener("click", e => {
          e.stopPropagation();
          const on = this._el.csw.getAttribute("aria-checked") === "true";
          this._hass.callService("input_boolean", on ? "turn_off" : "turn_on", { entity_id: this._c.creek });
        });
      }
    }
    this._key = null;
    this._opts = null;
    if (this._hass) this._render();
  }
  // A water body whose top edge is a gentle alternating wave at y=0; translated down to the level. Wide enough to drift 200px.
  _wave(alt) {
    const a = alt ? 18 : -14, y0 = alt ? -3 : 0;
    let d = `M100 ${y0} q50 ${a} 100 0`;
    for (let x = 200; x < 1200; x += 100) d += " t100 0";
    return d + " V600 H100 Z";
  }
  _more(id) {
    this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: id } }));
  }
  _tap() {
    const t = this._c.tap_action || { action: "more-info" };
    if (t.action === "none") return;
    if (t.action === "navigate" && t.navigation_path) {
      history.pushState(null, "", t.navigation_path);
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      return;
    }
    this._more(t.entity || this._c.entity);
  }
  set hass(h) {
    this._hass = h;
    if (this._el) this._render();
  }
  _st(id) { return id ? this._hass.states[id] : undefined; }
  _num(id) {
    const s = this._st(id);
    const v = s ? parseFloat(s.state) : NaN;
    return isFinite(v) ? v : null;
  }
  disconnectedCallback() { clearInterval(this._tick); this._tick = null; }
  connectedCallback() { if (this._hass && this._el) { this._key = null; this._render(); } }
  _render() {
    const c = this._c;
    const lvl = this._num(c.entity), vol = this._num(c.volume), dist = this._num(c.distance);
    const ps = this._st(c.pump), ts = this._st(c.pump_timer), rs = this._st(c.pump_run_time), pw = this._num(c.pump_power), cs = this._st(c.creek);
    const key = [lvl, vol, dist, ps && ps.state, ts && ts.state, ts && ts.attributes.finishes_at, ts && ts.attributes.remaining, rs && rs.state, pw, cs && cs.state].join("|");
    if (key === this._key) return;
    this._key = key;

    const cap = c.capacity;
    const p = lvl == null ? 0 : Math.max(0, Math.min(100 + c.headroom, lvl));
    const y = BOTTOM - (BOTTOM - this._top) * p / 100;
    this._el.levels.forEach(g => { g.setAttribute("transform", `translate(0 ${y})`); g.style.transform = `translateY(${y}px)`; });
    if (this._el.stream) this._el.stream.setAttribute("d", `M552 256 V${Math.max(256, y + 6).toFixed(0)}`);
    const low = lvl != null && lvl <= c.low;
    this._el.pcts.forEach(t => {
      t.innerHTML = lvl == null ? "–" : `${Math.round(lvl)}<tspan font-size="90" dx="6">%</tspan>`;
      t.classList.toggle("low", low);
    });
    const litres = vol != null ? vol : lvl != null ? cap * lvl / 100 : null;
    this._el.litres.innerHTML = litres == null ? "–" : `${fmt(litres)}<span>L</span>`;
    this._el.cap.textContent = litres == null ? "unavailable" : litres >= cap ? `full (${fmt(cap)} L)` : `left of ${fmt(cap)} L`;
    const unit = this._st(c.distance) && this._st(c.distance).attributes.unit_of_measurement;
    const m = dist == null ? null : unit === "mm" ? dist / 1000 : unit === "cm" ? dist / 100 : dist;
    this._el.dist.textContent = m == null ? "" : `${m.toFixed(2)} m from sensor to water`;

    if (!c.pump) return;
    const on = !!ps && ps.state === "on";
    const avail = !!ps && !["unavailable", "unknown"].includes(ps.state);
    const full = lvl != null && lvl >= 100;
    this._el.svg.classList.toggle("on", on);
    if (this._el.sw) {
      this._el.sw.setAttribute("aria-checked", on);
      this._el.sw.disabled = !avail || (full && !on);
      this._el.sw.title = full && !on ? "Silo is full" : "";
    }

    const opts = (rs && rs.attributes.options) || [];
    if (this._el.pills && JSON.stringify(opts) !== this._opts) {
      this._opts = JSON.stringify(opts);
      this._el.pills.innerHTML = "";
      opts.forEach(o => {
        const b = document.createElement("button");
        b.textContent = o;
        b.dataset.o = o;
        b.addEventListener("click", e => {
          e.stopPropagation();
          if (this._st(c.pump_run_time).state === o) return;
          this._hass.callService("input_select", "select_option", { entity_id: c.pump_run_time, option: o });
        });
        this._el.pills.appendChild(b);
      });
    }
    if (this._el.pills) this._el.pills.querySelectorAll("button").forEach(b => {
      const sel = rs && b.dataset.o === rs.state;
      b.classList.toggle("on", !!sel);
      b.setAttribute("aria-pressed", !!sel);
    });

    if (this._el.cstate) {
      const clear = !!cs && cs.state === "on", known = !!cs && ["on", "off"].includes(cs.state);
      if (this._el.csw) {
        this._el.csw.setAttribute("aria-checked", clear);
        this._el.csw.disabled = !known;
      }
      this._el.cstate.textContent = !known ? "Unavailable" : clear ? "Running clear" : "Check it after rain";
      this._el.cstate.classList.toggle("check", known && !clear);
    }

    clearInterval(this._tick);
    this._tick = null;
    const st = this._el.pstate;
    st.classList.toggle("run", on);
    if (!avail) { st.textContent = "Unavailable"; return; }
    if (!on) { st.textContent = full ? "Off · silo full" : "Off"; return; }
    const watts = pw != null ? ` · ${Math.round(pw)} W` : "";
    const ends = ts && ts.state === "active" && ts.attributes.finishes_at ? Date.parse(ts.attributes.finishes_at) : null;
    if (ends) {
      const show = () => { st.textContent = `${mmss((ends - Date.now()) / 1000)} left${watts}`; };
      show();
      this._tick = setInterval(show, 1000);
    } else {
      st.textContent = `Running${watts}`;
    }
  }
  getCardSize() { return this._c && this._c.pump ? (this._c.creek ? 5 : 4) : 3; }
  getGridOptions() { return { columns: 12, rows: "auto" }; }
}
if (!customElements.get("corujeira-silo-card")) customElements.define("corujeira-silo-card", CorujeiraSiloCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === "corujeira-silo-card"))
  window.customCards.push({ type: "corujeira-silo-card", name: "A Corujeira silo", description: "Water tank drawing that fills to the current level, with % and litres, plus an optional pump switch." });
})();

// ---- corujeira-span-card.js
/* A Corujeira span pills: wraps any card and overlays a row of range pills (from an input_select) in its top-right corner. Remove this resource to revert. */
(() => {
class CorujeiraSpanCard extends HTMLElement {
  setConfig(c) {
    if (!c || !c.entity || !c.card) throw new Error("corujeira-span-card: entity and card are required");
    this._c = { top: 12, right: 12, color: "#3D9BC9", ...c };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const r = this.shadowRoot;
    r.innerHTML = `
      <style>
        :host { display:block; }
        .wrap { position:relative; height:100%; }
        .pills { position:absolute; top:${this._c.top}px; right:${this._c.right}px; z-index:2; display:flex; gap:4px; }
        button { all:unset; box-sizing:border-box; cursor:pointer; font-family:'Lato',sans-serif; font-size:13px; font-weight:700; line-height:1;
          padding:6px 10px; border-radius:999px; color:var(--secondary-text-color);
          background:color-mix(in srgb, var(--primary-text-color) 7%, transparent);
          transition:background .15s, color .15s, transform .1s; -webkit-tap-highlight-color:transparent; }
        @media (hover:hover) { button:not(.on):hover { background:color-mix(in srgb, var(--primary-text-color) 13%, transparent); } }
        button:active { transform:scale(.94); }
        button:focus-visible { outline:2px solid ${this._c.color}; outline-offset:1px; }
        button.on { background:${this._c.color}; color:#fff; box-shadow:0 1px 3px rgba(0,0,0,.15); cursor:default; }
      </style>
      <div class="wrap"><div class="pills"></div><div class="inner"></div></div>`;
    this._pills = r.querySelector(".pills");
    this._opts = null;
    this._card = null;
    const make = async () => {
      const h = await window.loadCardHelpers();
      const el = h.createCardElement(this._c.card);
      el.addEventListener("ll-rebuild", e => { e.stopPropagation(); make(); });
      if (this._hass) el.hass = this._hass;
      const inner = r.querySelector(".inner");
      inner.innerHTML = "";
      inner.appendChild(el);
      this._card = el;
    };
    make();
  }
  set hass(h) {
    this._hass = h;
    if (this._card) this._card.hass = h;
    this._render();
  }
  _render() {
    const s = this._hass && this._hass.states[this._c.entity];
    if (!s) return;
    const opts = this._c.options || s.attributes.options || [];
    if (JSON.stringify(opts) !== this._opts) {
      this._opts = JSON.stringify(opts);
      this._pills.innerHTML = "";
      opts.forEach(o => {
        const b = document.createElement("button");
        b.textContent = o;
        b.dataset.o = o;
        b.addEventListener("click", e => {
          e.stopPropagation();
          if (this._hass.states[this._c.entity].state === o) return;
          this._hass.callService(this._c.entity.split(".")[0], "select_option", { entity_id: this._c.entity, option: o });
        });
        this._pills.appendChild(b);
      });
    }
    this._pills.querySelectorAll("button").forEach(b => {
      const on = b.dataset.o === s.state;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on);
    });
  }
  getCardSize() { return this._card && this._card.getCardSize ? this._card.getCardSize() : 5; }
  getGridOptions() { return { columns: 12, rows: "auto" }; }
}
if (!customElements.get("corujeira-span-card")) customElements.define("corujeira-span-card", CorujeiraSpanCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === "corujeira-span-card"))
  window.customCards.push({ type: "corujeira-span-card", name: "A Corujeira span pills", description: "Wraps a card with range pills in the top-right corner." });
})();

// ---- corujeira-zones-card.js
/* A Corujeira light zones: one compact row per lighting zone.
   - Tap the round icon to switch the zone on or off.
   - The row itself is a dimmer: drag (or tap) across it to set brightness; the fill shows the level in the
     light's own colour. Dragging an off zone switches it on at that level.
   - Dropdown chips on the right pick from input_selects (effect, colour, kitchen temperature, ...).
   - Long-press the row to open the zone's pop-up (e.g. "#yurt") for the rest of its settings.
   Options:
     title: optional heading inside the card
     zones: list of
       entity: light.x                  (required)
       name, icon                       (defaults from the entity)
       selects: [input_select.a, ...]   (dropdown chips, in order)
       popup: "#hash"                   (long-press target)
     color: fallback fill colour when the light reports none (default #A8662F) */
(() => {
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const HOLD_MS = 550, DRAG_PX = 6;

class CorujeiraZonesCard extends HTMLElement {
  setConfig(c) {
    if (!c || !Array.isArray(c.zones) || !c.zones.length) throw new Error("zones: list at least one light zone");
    this._c = { color: "#A8662F", ...c };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._built = false;
    if (this._hass) this._render();
  }
  getCardSize() { return 1 + this._c.zones.length; }
  getGridOptions() { return { columns: 12, rows: "auto" }; }
  set hass(h) {
    const prev = this._hass;
    this._hass = h;
    const ids = this._c ? this._c.zones.flatMap(z => [z.entity, ...(z.selects || [])]) : [];
    if (!prev || !this._built || ids.some(id => prev.states[id] !== h.states[id])) this._render();
  }

  _build() {
    const c = this._c;
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { padding:6px 12px; }
        .title { font-size:14px; font-weight:700; padding:6px 2px 2px; color:var(--primary-text-color); }
        .row { position:relative; display:flex; align-items:center; gap:10px; padding:8px 6px; margin:2px -6px; border-radius:14px;
          overflow:hidden; touch-action:pan-y; user-select:none; -webkit-user-select:none; cursor:ew-resize; -webkit-tap-highlight-color:transparent; }
        .row + .row::after { content:""; position:absolute; left:8px; right:8px; top:0; border-top:1px solid rgba(52,58,64,.10); }
        .fill { position:absolute; inset:0 auto 0 0; width:0; border-radius:14px; pointer-events:none;
          background:color-mix(in srgb, var(--zc) 26%, transparent); transition:width .25s ease; }
        .row.drag .fill { transition:none; }
        .ic { position:relative; flex:none; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          border:1.5px solid rgba(52,58,64,.28); color:var(--primary-text-color); cursor:pointer; background:var(--card-background-color, #fff); }
        .ic ha-icon { --mdc-icon-size:24px; }
        .row.on .ic { background:var(--zc); border-color:transparent; color:#fff; }
        .txt { position:relative; flex:1; min-width:0; pointer-events:none; }
        .name { font-size:14.5px; font-weight:700; color:var(--primary-text-color); line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .state { font-size:12.5px; color:var(--secondary-text-color); line-height:1.3; }
        .chips { position:relative; display:flex; gap:6px; flex:none; }
        .chip { position:relative; display:flex; align-items:center; gap:3px; height:30px; padding:0 8px 0 11px; border-radius:999px;
          background:var(--zone-chip-color, ${esc(c.color)}); color:#fff; font-size:12.5px; font-weight:600; white-space:nowrap; cursor:pointer; }
        .chip ha-icon { --mdc-icon-size:16px; opacity:.85; }
        .chip select { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; font-size:16px; }
      </style>
      <ha-card>${c.title ? `<div class="title">${esc(c.title)}</div>` : ""}<div class="rows"></div></ha-card>`;
    this._built = true;
  }

  _render() {
    if (!this._hass || !this._c) return;
    if (!this._built) this._build();
    const h = this._hass, wrap = this.shadowRoot.querySelector(".rows");
    if (this._dragging) return; // don't rebuild under a finger
    wrap.innerHTML = "";
    this._c.zones.forEach(z => {
      const st = h.states[z.entity];
      const on = st && st.state === "on";
      const a = (st && st.attributes) || {};
      const pct = on ? (a.brightness != null ? Math.round(a.brightness / 2.55) : 100) : 0;
      const rgb = Array.isArray(a.rgb_color) ? `rgb(${a.rgb_color.join(",")})` : this._c.color;
      const row = document.createElement("div");
      row.className = `row${on ? " on" : ""}`;
      row.style.setProperty("--zc", on ? rgb : this._c.color);
      const name = z.name || a.friendly_name || z.entity;
      const state = !st ? "Unavailable" : on ? `On · ${pct}%` : st.state === "unavailable" ? "Unavailable" : "Off";
      const chips = (z.selects || []).map(id => {
        const s = h.states[id];
        if (!s) return "";
        const opts = (s.attributes.options || []).map(o => `<option${o === s.state ? " selected" : ""}>${esc(o)}</option>`).join("");
        return `<label class="chip"><span>${esc(s.state)}</span><ha-icon icon="mdi:chevron-down"></ha-icon><select data-id="${esc(id)}" aria-label="${esc(s.attributes.friendly_name || id)}">${opts}</select></label>`;
      }).join("");
      row.innerHTML = `<div class="fill" style="width:${pct}%"></div>
        <div class="ic" role="button" aria-label="Switch ${esc(name)} ${on ? "off" : "on"}"><ha-icon icon="${esc(z.icon || a.icon || "mdi:lightbulb-group")}"></ha-icon></div>
        <div class="txt"><div class="name">${esc(name)}</div><div class="state">${esc(state)}</div></div>
        <div class="chips">${chips}</div>`;
      this._wire(row, z, on, pct);
      wrap.appendChild(row);
    });
  }

  _wire(row, z, on, pct) {
    const h = () => this._hass;
    row.querySelector(".ic").addEventListener("click", e => {
      e.stopPropagation();
      h().callService("light", on ? "turn_off" : "turn_on", { entity_id: z.entity });
    });
    row.querySelectorAll("select").forEach(sel => {
      sel.addEventListener("pointerdown", e => e.stopPropagation());
      sel.addEventListener("change", () => h().callService("input_select", "select_option", { entity_id: sel.dataset.id, option: sel.value }));
    });
    // the row is the dimmer: pointer x maps to 1-100%, long-press opens the pop-up
    const fill = row.querySelector(".fill"), stateEl = row.querySelector(".state");
    let start = null, hold = null, moved = false, val = pct;
    const at = x => { const r = row.getBoundingClientRect(); return Math.max(1, Math.min(100, Math.round((x - r.left) / r.width * 100))); };
    row.addEventListener("pointerdown", e => {
      if (e.target.closest(".ic, .chip")) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId }; moved = false;
      clearTimeout(hold);
      if (z.popup) hold = setTimeout(() => {
        start = null; this._dragging = false; row.classList.remove("drag");
        history.pushState(null, "", location.pathname + location.search + z.popup);
        window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      }, HOLD_MS);
    });
    row.addEventListener("pointermove", e => {
      if (!start || e.pointerId !== start.id) return;
      if (!moved && Math.abs(e.clientX - start.x) < DRAG_PX) return;
      if (!moved) { moved = true; clearTimeout(hold); this._dragging = true; row.classList.add("drag"); try { row.setPointerCapture(e.pointerId); } catch (_) {} }
      val = at(e.clientX);
      fill.style.width = `${val}%`; stateEl.textContent = `${val}%`;
    });
    const end = e => {
      clearTimeout(hold);
      if (!start || (e && e.pointerId !== start.id)) return;
      const tapX = e ? e.clientX : null;
      start = null; this._dragging = false; row.classList.remove("drag");
      if (e && e.type === "pointercancel") { this._render(); return; }
      if (!moved && tapX != null) { val = at(tapX); fill.style.width = `${val}%`; }
      h().callService("light", "turn_on", { entity_id: z.entity, brightness_pct: val });
    };
    row.addEventListener("pointerup", end);
    row.addEventListener("pointercancel", end);
  }
}
if (!customElements.get("corujeira-zones-card")) customElements.define("corujeira-zones-card", CorujeiraZonesCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === "corujeira-zones-card"))
  window.customCards.push({ type: "corujeira-zones-card", name: "A Corujeira light zones", description: "One row per lighting zone: tap the icon to switch, drag the row to dim, dropdowns for effect and colour." });
})();
