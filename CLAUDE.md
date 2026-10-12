# corujeira-dashboard

Custom Lovelace cards for the A Corujeira Home Assistant dashboard. Installed via HACS as a Dashboard repository.

## Layout

- `cards/corujeira-*-card.js`: one file per card (flow, span, forecast, meteogram, hoot, silo, fire, air). Each card's options are documented in its header comment.
- `dist/corujeira-dashboard.js`: the built bundle HACS serves.
- `assets/`: standalone animated SVGs (`hoot.svg`, `nimbu.svg`).
- The fire card is no longer on the dashboard (the ha-vigia integration replaced it).

## Build and release

1. `node scripts/build.mjs` joins `cards/*.js` into `dist/corujeira-dashboard.js`.
2. Commit both the card source and `dist/`. Bump `version` in `package.json`.
3. Push to `main`. No tags or GitHub releases (cloud sessions get 403); HACS tracks commits on `main`.
4. In Home Assistant: HACS update information + download for repo id `1411586934`, then hard-refresh the tablet. HACS serves it at `/hacsfiles/corujeira-dashboard/corujeira-dashboard.js`.

## Previewing a card without HA

Playwright page with stub `ha-card` / `ha-icon` elements, the card JS, and a fake `hass.states` object renders it headless.

## Brand stays out of this repo

The brand CSS (type, cream tiles, warm dialogs) and the `corujeira:<name>` icon set live only as inline resources inside Home Assistant. Never add them here. Cards must look fine with stock HA styling.

## Card notes

### Hoot (land advice)

- Speech bubble beside a speaker, one recolourable icon per line. Kinds: mushroom, plant, fire, frost, rain, wind, heat, power, water (`colors` option). Bold lead phrase, 6 lines then "N more".
- Speakers: `speaker: hoot | nimbu`. `swap` (default on unless `navigate` is set) lets a tap swap them, remembered in localStorage `corujeira-land:speaker`, which wins over config.
- Weather advice is computed in the meteogram card's `_advice` (each line tagged with a kind) and published via window event `corujeira-land-advice`, `window.__corujeiraLand` and localStorage `corujeira-land:advice`. Hoot needs the meteogram on the same dashboard; advice older than 18 h is dropped.
- Fire lines come from Vigia sensors in Hoot's `_fire`: active alert, risk high or above (today or tomorrow), nearby fires, and a low-risk line May to Oct (`burn_window: false` turns it off).
- Fire line tone: practical, not over-conservative. The land doesn't burn pruning piles, so no burning or burn-registration advice. The low-risk line suggests grinding, welding, chainsaw work, or a fire in the sauna or fire pit.
- New weather rules go in the meteogram's `_advice`; new fire rules go in Hoot's `_fire`.
- Meteogram low-silo line (`silo`, `silo_low` default 40%) is off on the dashboard. Scale: 100% = 5,000 L.

### Silo

- 5,000 L tank = 100%. Level can exceed 100 when overfilled; dashed line at 100%.
- Drawing style: every line is a filled brush stroke from hand-placed points (Catmull-Rom, width swelling about ±16%, gentle wobble, tapered round ends, seeded so it never changes), matching hand-drawn icons in soft charcoal. Shape lives in `BODY` and `drawing()`. Keep it subtle when tuning. Default ink is the text colour softened to 68% against the card background; `ink` overrides.
- Pump row: switch (disabled while full), 30/60/90 pills, countdown and watts while running. Optional `creek` option adds the creek-clear switch row.

### Air

- Compact verdict tile plus a detail mode for a pop-up. Bands and damp advice logic are in the card; keep thresholds there in sync with any doc changes.

### Flow

- Supports up to 4 loads (circles shrink, staggered wire heights so lines never cross), `dashed: true` per load, and multiple sources in the top row.

## Writing

README, UI strings and commit messages: no em dashes, no "it's not X, it's Y" phrasing, no unhedged superlatives.
