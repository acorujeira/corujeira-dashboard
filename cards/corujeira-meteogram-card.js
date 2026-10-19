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
