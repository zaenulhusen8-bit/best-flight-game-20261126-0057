# Ridge Runner — Meridian Valley

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/zaenulhusen8-bit/best-flight-game-20261126-0057/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/zaenulhusen8-bit/best-flight-game-20261126-0057/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

A complete, original 3D flight game that runs offline in a desktop browser from
static files. Fly the little skylark **“Kestrel”** over Meridian Valley — a river
valley ringed by snow-capped ridges, with one grass airfield at its heart.

## Play

Serve `game/` with any static server (`node serve.ts`, then open
http://localhost:8080) and pick a mission:

1. **Ring Run** — thread 8 glowing rings over the valley. Fuel is tight, fly smooth.
2. **Runway Landing** — take off, fly the circuit, put her down gently on runway 09.
3. **Ridge Time Trial** — 10 rings against the clock.

Controls: **W/S** pitch, **A/D** bank, **Shift/Ctrl** throttle, **mouse** steers,
**C** camera (chase / cockpit), **O** autopilot demo, **P** pause, **R** restart.
Fuel burns with throttle; hard terrain strikes cost airframe; an empty tank
means a glider. The HUD shows altitude, speed, heading and throttle, plus a lit
instrument panel with an artificial horizon, compass strip and dials.

## Layout

- `game/index.html` — the page and HUD
- `game/src/main.js` — bootstrap and game loop
- `game/src/terrain.js` — seeded valley, river, airfield, forest, clouds, sky
- `game/src/aircraft.js` — the Kestrel mesh and its flight model
- `game/src/missions.js` — the three sorties and their scoring
- `game/src/hud.js` — readouts and the painted instrument panel
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — synthesised WebAudio engine, wind, chimes
- `game/src/shots.js` — autopilot and screenshot presets
- `game/vendor/three.min.js` — vendored Three.js (r152, minified build)
- `main.ts` — the entry program (copies `game/` + `screenshots/`, writes the dossier)

MIT licensed. Built for the make.fun best flight game bounty.
