# corujeira-dashboard

Custom Lovelace cards for the A Corujeira Home Assistant dashboard. Installed via HACS as a Dashboard repository.

## Layout

- `cards/corujeira-*-card.js`: one file per card (flow, span, forecast, meteogram, hoot, silo, fire, air, zones). Each card's options are documented in its header comment.
- `dist/corujeira-dashboard.js`: the built bundle HACS serves.
- `cards/corujeira-mirror-strategy.js`: dashboard strategy `custom:corujeira-mirror`. The communal kitchen dashboard (`corujeira-kitchen`) is a live mirror of the main one (`corujeira-bubble`) without the Clayhouse light and with the silo read-only. Its `layout` option regroups the main view into three columns for the landscape kitchen tablet (column 1 header, compact Nimbu, light zones, compact weather; column 2 energy; column 3 water, fire tile, air). `set` by card type makes Hoot compact (tap opens the `#nimbu` pop-up on the main dashboard) and runs the meteogram hidden (forecast in the `#weather` pop-up). `kiosk_mode` passes through to the kiosk-mode plugin (hides the header) and `fit: true` zooms the view so it never scrolls; `fill: true` spreads the shorter columns so all three end at the same line (extra space goes before group headings). Change the main dashboard, not the kitchen one.
- `assets/`: standalone animated SVGs (`hoot.svg`, `nimbu.svg`).
- The fire card is no longer on the dashboard (the ha-vigia integration replaced it).

## Build and release

1. `node scripts/build.mjs` joins `cards/*.js` into `dist/corujeira-dashboard.js`.
2. Commit both the card source and `dist/`. Bump `version` in `package.json`.
3. Push to `main`. No tags or GitHub releases (cloud sessions get 403); HACS tracks commits on `main`.
4. In Home Assistant: HACS update information + download for repo id `1411586934`, then hard-refresh the tablet. A download right after a push can fetch the previous build (GitHub lag) while HACS still moves the resource's hacstag: check the served file's version header (`/hacsfiles/corujeira-dashboard/corujeira-dashboard.js`) and download again if it's stale. The kitchen tablet (Fully Kiosk) reloads from HA: press `button.yurt_kitchen_kitchen_dashboard_clear_browser_cache`, then `..._load_start_url`. HACS serves it at `/hacsfiles/corujeira-dashboard/corujeira-dashboard.js`.

## Previewing a card without HA

Playwright page with stub `ha-card` / `ha-icon` elements, the card JS, and a fake `hass.states` object renders it headless.

## Brand stays out of this repo

The brand CSS (type, cream tiles, warm dialogs) and the `corujeira:<name>` icon set live only as inline resources inside Home Assistant. Never add them here. Cards must look fine with stock HA styling.

## Card notes

### Hoot (land advice)

- Speech bubble beside a speaker, one recolourable icon per line. Kinds: mushroom, plant, fire, frost, rain, wind, heat, power, water (`colors` option). Bold lead phrase, 6 lines then "N more".
- Speakers: `speaker: hoot | nimbu`. `swap` (default on unless `navigate` is set) lets a tap swap them, remembered in localStorage `corujeira-land:speaker`, which wins over config.
- Weather advice is computed in the meteogram card's `_advice` (each line tagged with a kind) and published via window event `corujeira-land-advice`, `window.__corujeiraLand` and localStorage `corujeira-land:advice`. Hoot needs the meteogram on the same dashboard; advice older than 18 h is dropped.
- Fire lines come from Vigia sensors in Hoot's `_fire`, and only two kinds (Eska, 5 Nov 2026: no fire talk out of season): a fire inside Vigia's alert zone (alert_level watch/upwind/close) and fire risk high or above today or tomorrow. Nearby fires outside the alert zone and the calm-day spark-work lines were removed.
- Fire line tone: practical, not over-conservative. Watch lines speak in the speaker's voice ("I'm watching the hills" for Hoot, "I'm sniffing the wind" for Nimbu). The land doesn't burn pruning piles, so no burning or burn-registration advice.
- Lines are short (Eska, 5 Nov 2026: Hoot was too wordy): a lead with what and when ("Rain tomorrow to Wed+", "Power saving until Wed"), a colon, then a few words of what to do. No hour-level detail; the hours live in the energy tile's Ahead chart.
- The bold lead is coloured by the line's kind (same colour as its icon): land green (plant, mushroom), sun and power orange, fire red, water and rain blue, frost ice blue, wind grey. KINDS in the Hoot card.
- Power line: "Power saving until <day>: no air fryer or Instant Pot." only when the meteogram's battery run-forward says a cook would cut into charge the coming days need. Nothing is said when power is fine.
- New weather rules go in the meteogram's `_advice`; new fire rules go in Hoot's `_fire`.
- Each advice line can carry a `tag` (two-word keyword such as "Frost Thu", "Foraging", "Heat spot") for Hoot's `compact` mode, which shows colour-coded keyword chips instead of sentences. Add a tag to every new rule.
- Hoot `compact` shows a short greeting and, per line, the tag chip plus a few words of `detail` (from the line's `detail`, else the first clause after its lead phrase); `details: false` gives bare chips.
- Meteogram `compact: true`: a weather tile (now from `current` weather entity, humidity/wind/`uv`, the written forecast, a five-day strip); the kitchen uses it instead of the charts.
- Meteogram `hidden: true` fetches and publishes advice without drawing (the card hides its slot via `card-visibility-changed`).
- Meteogram load profile: an hour whose statistics min equals max counts as 0 W. Those hours are ones HA backfilled after a restart: when Eska switches the MultiPlus off overnight, HA (on the HA Green) goes off too, and on boot the recorder fills the missed hours with the last value it saw. The dashboard's energy charts drop the same flat 5-minute buckets (in their `data_generator`s on `corujeira-bubble`).
- Meteogram low-silo line (`silo`, `silo_low` default 40%) is off on the dashboard. Scale: 100% = 5,000 L.

### Silo

- 5,000 L tank = 100%. Level can exceed 100 when overfilled; dashed line at 100%.
- Drawing style: every line is a filled brush stroke from hand-placed points (Catmull-Rom, width swelling about ±16%, gentle wobble, tapered round ends, seeded so it never changes), matching hand-drawn icons in soft charcoal. Shape lives in `BODY` and `drawing()`. Keep it subtle when tuning. Default ink is the text colour softened to 68% against the card background; `ink` overrides.
- Pump row: switch (disabled while full), 30/60/90 pills, countdown and watts while running. Optional `creek` option adds the creek-clear switch row.
- `read_only: true` keeps the pump and creek rows as status only (no switches, pills or pop-ups). The kitchen mirror sets it automatically.

### Zones (light zones)

- One row per zone: tap the round icon to switch, drag or tap across the row to set brightness (fill shows the level in the light's colour), dropdown chips (native selects) for each input_select, long-press for the zone pop-up. Replaced the four Bubble zone buttons on 19 Oct 2026.

### Air

- Compact verdict tile plus a detail mode for a pop-up. Bands and damp advice logic are in the card; keep thresholds there in sync with any doc changes.

### Flow

- Supports up to 4 loads (circles shrink, staggered wire heights so lines never cross), `dashed: true` per load, and multiple sources in the top row.
- `stale: <binary_sensor>`: while on, all values show a dash, wires go quiet, and the hub reads "No data" with the time the hub entity last updated. On the dashboard it is `binary_sensor.power_data_stale` (no Victron GX reading for 5 min while HA runs; an overnight MultiPlus switch-off takes HA down too, so that case shows up as flat backfilled statistics instead).

## Writing

README, UI strings and commit messages: no em dashes, no "it's not X, it's Y" phrasing, no unhedged superlatives.
