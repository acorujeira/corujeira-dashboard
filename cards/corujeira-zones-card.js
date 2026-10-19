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
