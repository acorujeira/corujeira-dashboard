# A Corujeira dashboard

Custom Lovelace cards for the Home Assistant dashboard at A Corujeira, an off-grid land in the Minho Valley, Portugal. Each card is a single, dependency-free JavaScript file.

| Card | Type | What it shows |
| --- | --- | --- |
| [`corujeira-air-card.js`](cards/corujeira-air-card.js) | `custom:corujeira-air-card` | Indoor air as one plain-language verdict with advice (damp advice compares the water in the air inside and out, and leads with the wood burner in cold weather); a detail mode for a pop-up shows each reading on a banded bar with a reference line. |
| [`corujeira-flow-card.js`](cards/corujeira-flow-card.js) | `custom:corujeira-flow-card` | Power flow: up to 3 sources on top, a hub, up to 4 loads below, with animated wiring-diagram lines. |
| [`corujeira-span-card.js`](cards/corujeira-span-card.js) | `custom:corujeira-span-card` | Wraps any card and overlays range pills driven by an `input_select`. |
| [`corujeira-forecast-card.js`](cards/corujeira-forecast-card.js) | `custom:corujeira-forecast-card` | Next 12 hours (2-hourly) above a 5-day forecast, from any `weather` entity. |
| [`corujeira-meteogram-card.js`](cards/corujeira-meteogram-card.js) | `custom:corujeira-meteogram-card` | Multi-model Open-Meteo meteogram with rain agreement, wind, a written summary and land advice. |
| [`corujeira-hoot-card.js`](cards/corujeira-hoot-card.js) | `custom:corujeira-hoot-card` | Hoot the land wizard: an owl with a speech bubble of land advice (from the meteogram and Vigia fire watch), each line with a recolourable icon. |
| [`corujeira-silo-card.js`](cards/corujeira-silo-card.js) | `custom:corujeira-silo-card` | A water tank drawing that fills to the current level, with the % inside and litres beside it, plus an optional pump switch with run-time pills and countdown. |
| [`corujeira-fire-card.js`](cards/corujeira-fire-card.js) | `custom:corujeira-fire-card` | IPMA fire risk and weather warning, plus nearby NASA FIRMS hotspots and wind direction. |

## Install

All eight cards ship as one file, `dist/corujeira-dashboard.js`.

**With HACS:** HACS > three-dot menu > Custom repositories > add `acorujeira/corujeira-dashboard`, type Dashboard. Download it, then refresh the browser. HACS registers the resource for you, and new releases show up as updates.

**By hand:** copy `dist/corujeira-dashboard.js` into `config/www/`, then add it under Settings > Dashboards > Resources as `/local/corujeira-dashboard.js`, type JavaScript module.

Options are documented in the comment block at the top of each file in `cards/`.

## Making a change

1. Edit the card in `cards/`.
2. Run `node scripts/build.mjs` to rebuild `dist/corujeira-dashboard.js`, and commit both.
3. Bump `version` in `package.json` and push to `main`. With no releases published, HACS tracks the latest commit on `main` and offers each push as an update (HACS checks about every 48 hours; "Update information" in HACS checks now).

## Examples

```yaml
type: custom:corujeira-air-card       # mode: detail for a pop-up
humidity: sensor.yurt_humidity
co2: sensor.yurt_co2
radon: sensor.yurt_radon
pm25: sensor.yurt_pm2_5
voc: sensor.yurt_voc
temperature: sensor.yurt_temperature
outdoor: weather.forecast_home
navigate: "#air"
```

```yaml
type: custom:corujeira-forecast-card
entity: weather.forecast_home
navigate: "#weather"
```

```yaml
type: custom:corujeira-meteogram-card
title: Meteogram
silo: sensor.silo_level   # optional, enables the low-silo pump advice
```

```yaml
type: custom:corujeira-hoot-card   # needs a corujeira-meteogram-card on the dashboard
colors: { mushroom: "#A0673A", fire: "#C2574A" }
```

```yaml
type: custom:corujeira-silo-card
entity: sensor.water_silo_level      # %, 100 = full storage
volume: sensor.water_silo_volume     # L, optional
capacity: 5000
pump: switch.pump_switch             # optional pump row
pump_timer: timer.pump_timer
pump_run_time: input_select.pump_run_time
```

```yaml
type: custom:corujeira-fire-card
risk: sensor.ponte_de_lima_fire_risk
warning: sensor.ponte_de_lima_weather_alert
wind: weather.forecast_home
```

```yaml
type: custom:corujeira-span-card
entity: input_select.chart_span
card:
  type: history-graph
  entities: [sensor.battery_soc]
```

```yaml
type: custom:corujeira-flow-card
hub: { entity: sensor.house_power, name: Home, color: "#3D9BC9", icon: mdi:home }
sources:
  - { entity: sensor.solar_power, name: Solar, color: "#E9A92C", icon: mdi:solar-power }
  - { entity: sensor.battery_power, soc_entity: sensor.battery_soc, name: Battery, color: "#3DAA5C", bidirectional: true }
loads:
  - { entity: sensor.lighting_power, name: Lighting, color: "#E8913A", icon: mdi:lightbulb }
  - { entity: sensor.other_loads_power, name: Other, color: "#A08C7A", icon: mdi:dots-horizontal, dashed: true }
```

## License

MIT, see [LICENSE](LICENSE).
