# Fogbound

A small open-sea exploration game in the browser. You have a fast boat, an island you know,
and a sea that isn't finished yet: the further you run from Olvenholt, the deeper the water
and the thicker the fog.

It's the successor to *Soundings*, rebuilt: one looped island instead of a peninsula off the
edge of the sheet, a fractal coast (rock on exposed shores, sand in sheltered bays), layered fog
that thickens with distance, a 12 m sport boat with a proper planing model, wakes you can feel,
docking under power, fuel barges, heading-up, and a fantasy world in place of the old
Japanese place names.

## Play

- **Drop-in file:** open `dist/fogbound.html` in any browser with WebGL 2. It is one
  self-contained file (fonts come from Google Fonts; everything else is inline).
- **From source:** open `index.html` directly (no server or build needed); it loads the
  scripts in `src/` in order.

| Key | |
| --- | --- |
| W / S, ↑ / ↓ | Throttle up / down. The lever stays where you leave it. |
| 1 2 3 4, X / Space | Dead slow, half, cruise, full; all stop. |
| A / D, ← / → | Steer. |
| Hold on the water | Steer towards that point; further away is more throttle. |
| Enter | Come alongside, go ashore, cast off. |
| F | Nearest fuel (press again for the next nearest). |
| H | Heading-up / north-up. |
| M | The whole chart. |
| Q / E, scroll, pinch | Zoom. |

## How it's built

Plain JavaScript and one WebGL 2 fragment shader; no dependencies, no build step for
development. `tools/build.mjs` concatenates the scripts into `dist/fogbound.html`.

| File | |
| --- | --- |
| `src/core.js` | Maths, and the noise shared by JS and GLSL. The coast's fractal detail (`coastDisp`, `profileH`) is computed identically on both sides so collisions match what you see. |
| `src/terrain.js` | Coast polygons → midpoint-displaced (fractal) rings → raster → distance fields → one RGBA16F texture: signed distance to the coast, far-field height, exposure (rock ↔ sand), remoteness. Also the tidal-stream solver. |
| `src/render.js` | The world shader: fractal coast, cliffs and beaches, trees with shadows, surf and lapping water, caustics, chart contours, the uncharted mist, three parallax fog banks, the Veil. |
| `src/boat.js` | Physics: a continuous planing factor (displacement → semi-planing hump → planing), hull damage that caps the plane, grounding on sand vs rock, engine start/cut sequences, docking autopilot. |
| `src/traffic.js` | Kelvin wake crests (and hitting them), ferries/coaster/launch/fishing boats/yachts routed by A*, radio chatter. |
| `src/draw.js` | The overlay canvas: your boat, the chase-cam card when zoomed out, other boats, piers, barges, towns with parallax roofs, lighthouse beams, buoys, gulls, labels, the fuel finder. |
| `src/places.js`, `src/data/world.js` | The world's contents: docks (which find their own coast and build piers to working depth), towns, the coast road, lore. |
| `src/chart.js`, `src/ui.js`, `src/main.js` | Charting, HUD and dialogs, the loop. |

Dev tools (need Playwright with Chromium): `tools/shoot.mjs` renders screenshots headless,
`tools/physics.mjs` drives the boat without drawing and prints how she behaves.

## Data

The coastlines are real silhouettes from the Seto Inland Sea, rescaled, rearranged and renamed:
Olvenholt is Shōdoshima; the islets around it are Teshima, Naoshima, Megijima/Ogijima, the
Ieshima group and others; Hollow Isle is Etajima. `tools/extract-coast.mjs` regenerates
`src/data/coast.js` from the GeoJSON in
[smartnews-smri/japan-topography](https://github.com/smartnews-smri/japan-topography) (s0010).

Credit, as MLIT requires: 「国土数値情報（行政区域データ）」（国土交通省）を加工して作成.
Source: MLIT National Land Numerical Information, administrative areas (N03), 2021.
