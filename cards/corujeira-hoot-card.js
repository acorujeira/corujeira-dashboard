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
