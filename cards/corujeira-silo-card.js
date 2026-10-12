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
