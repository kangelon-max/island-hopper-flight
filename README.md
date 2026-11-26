# Island Hopper — a tiny flight school

A complete, original 3D flight game that plays offline in a desktop browser
from its own static files. Raw WebGL, no engine library: the renderer, the
flight model and every vertex of the aeroplane and the island are written
for this game.

You fly the Pelican, a single-engine trainer, over Pelican Island — a
heightfield island with a flattened runway strip, the town of Pelican Bay,
a lighthouse, scattered farms and tree cover, ringed by distant peaks.

## The sorties

1. **Ring Course** — thread all 8 glowing rings around the island against
   the clock. The next ring is gold; the rest are teal.
2. **Landing Challenge** — start on final and put her on the runway: sink
   rate at the touch and stopping on the strip decide the score.
3. **Free Flight** — take off, explore, and land back when fuel runs low.

The flight model rewards discipline: throttle against drag and gravity, a
wing that stalls below 24 m/s, banked turns that trade speed for heading,
fuel that burns faster at full throttle, and touchdowns that are judged —
come down harder than 8.5 m/s and the gear collapses.

## Controls

| Keys | Action |
| --- | --- |
| W / S or Shift / Ctrl | throttle up / down |
| Arrow keys | pitch and roll |
| Mouse move | steer (gentle) |
| A / D | rudder |
| B or Space | brakes on the ground |
| C | cockpit / chase camera |
| R | restart the sortie |
| 1 / 2 / 3 | choose a mission |

Instruments on the HUD: heading tape, airspeed, altitude, vertical speed,
an artificial horizon with a pitch ladder, throttle and fuel bars, stall
and low-fuel warnings, and the mission panel.

## Layout

- `game/index.html` — the page; `game/style.css` — the menu styling.
- `game/src/gl-utils.js` — mat4 math, the lit/fogged shader, mesh builder.
- `game/src/world.js` — the island heightfield, runway, town, sky.
- `game/src/aircraft.js` — the Pelican, modelled from geometry.
- `game/src/flight-model.js` — thrust, drag, stall, ground handling.
- `game/src/missions.js` — the ring course, landing judge, scoring.
- `game/src/hud.js` — the instrument panel on a 2D canvas.
- `game/src/audio.js` — synthesized engine hum and wind (WebAudio).
- `game/src/main.js` — boot, input, cameras, the game loop.
- `main.ts` — the hand-in program; `vendor/makefun-game.ts` — the kit's
  dossier library, unchanged.
- `screenshots/` — real renders of the game, composed with the harmless
  `?shot=` scenes in `main.js` (see `shots.json`).

## Play locally

```
node serve.ts            # serves game/ at http://localhost:8080
```

## Hand in

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This entry is for make.fun's "Make the best flight game" bounty:
https://make.fun/bounty/best-flight-game-20261126-0057

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/kangelon-max/island-hopper-flight/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/kangelon-max/island-hopper-flight/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Licensed under the MIT License (see `LICENSE`).
