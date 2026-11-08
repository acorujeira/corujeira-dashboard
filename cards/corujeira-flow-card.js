/* A Corujeira flow card v5: sources on top, hub in the middle, up to 4 loads below, wiring-diagram lines.
   With 4 loads the load circles shrink so they fit. A node with dashed: true gets a dashed ring (used for "Other").
   Scales to match the height of the card beside it in the same row. Remove this resource to revert.
   stale: <binary_sensor> (optional). While it is on, the readings are old (e.g. the inverter is off and the
   network with it), so every value shows a dash, the wires go quiet and the hub reads "No data" with the time
   the hub entity last updated. */
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
        .wrap.stale .node:not(.hub), .wrap.stale .line { opacity:.45; }
        .wrap.stale .node.hub .val { font-size:10.5px; }
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

  _isStale() {
    const id = this._c.stale, s = id && this._hass.states[id];
    return !!(s && s.state === "on");
  }
  _since() {
    const s = this._hass.states[this._c.hub.entity];
    const t = s && Date.parse(s.last_updated);
    if (!isFinite(t)) return "";
    const d = new Date(t);
    const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    return Date.now() - t < 20 * 3600e3 ? "since " + hm : "since " + d.toLocaleDateString([], { weekday: "short" });
  }

  _update() {
    if (!this._built || !this._hass) return;
    const root = this.shadowRoot;
    const stale = this._isStale();
    root.querySelector(".wrap").classList.toggle("stale", stale);
    Object.values(this._byKey).forEach(n => {
      const el = root.querySelector(`.node[data-k="${n.key}"]`);
      if (!el) return;
      if (stale) {
        const topText = el.querySelector(".tt"), topIcon = el.querySelector(".ti"), val = el.querySelector(".val");
        topIcon.hidden = true;
        if (n.key === "hub") { topText.textContent = this._since(); val.textContent = "No data"; return; }
        topText.textContent = n.soc_entity ? "—" : this._secondary(n);
        val.classList.remove("batt");
        val.textContent = "—";
        root.querySelector(`.line[data-k="${n.key}"]`).classList.add("idle");
        root.querySelector(`.dot[data-k="${n.key}"]`).classList.add("idle");
        return;
      }
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
