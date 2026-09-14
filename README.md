# Thunder Strike

A browser tribute to Desert Strike (Electronic Arts, 1992): an isometric attack helicopter, three weapons, finite fuel and armour, a desert province full of enemy emplacements, supply crates to winch up and prisoners to bring home.

Built with Next.js 16, TypeScript and Three.js on the WebGPU renderer with TSL node materials. Browsers without WebGPU fall back to WebGL 2 automatically.

## Play

```
npm install
npm run dev
```

Open http://localhost:3000. Add `?webgl=1` to force the WebGL 2 backend, `?nopost=1` to disable bloom.

Aim assist is on by default: chain gun and Hydra rounds bend up to about eight degrees toward the nearest enemy in a narrow cone ahead, so you still have to point at the target but need not be exact. Turn it off in the pause menu; the choice is remembered by the browser.

### On a phone

Open the deployed site in Safari, then Share, Add to Home Screen. Launched from the icon it runs without browser chrome; hold the phone in landscape. A stick appears wherever your left thumb lands and the aircraft flies toward wherever it points; let go to slow down. FIRE, FLARES and two strafe buttons sit under the right thumb, tapping a weapon in the list selects it, pinching zooms the camera, and the pause button is at the top. Touch controls switch on automatically for coarse pointers; `?touch=1` forces them on a desktop for layout work and `?touch=0` forces them off.

| Key | Action |
| --- | --- |
| W / Up | Forward thrust |
| S / Down | Brake and reverse |
| A D / Left Right | Rotate |
| Q / E | Strafe |
| Space | Fire selected weapon |
| 1 2 3 / Tab | Chain gun, Hydra rockets, Hellfire missiles |
| F / Ctrl | Drop flares to decoy incoming missiles |
| Mouse wheel | Zoom |
| Esc / P | Pause |
| M | Mute |

Hover slowly over a crate or a POW and the winch engages on its own. Bring POWs back to the landing zone on the beach, which also refuels and repairs the aircraft.

## Leaderboard

Each mission has its own board. Completing a mission scores it from the results: a completion bonus, points per kill and per rescue, a bonus for finishing inside thirty minutes, minus damage taken and a penalty for every airframe lost (`src/game/core/Score.ts`). The results card asks for a call sign and posts the run; the board is also reachable from the title screen.

Scores live in Upstash Redis, provisioned through the Vercel Marketplace, as one sorted set per mission: the run is the member and the score is the sort key, so the top twenty is one command and the board is trimmed to a hundred rows. The two Route Handlers in `app/api/scores/[mission]/route.ts` read the board and accept a run; the server recomputes the score from the posted stats with the same formula the client used. Without the store's environment variables the endpoints answer 503 and the game shows the board as unreachable, so a local checkout without `vercel env pull` still plays. There is no anti-cheat: the stats come from the browser and are only clamped to sane ranges.

## Missions

START MISSION opens a picker; every mission is always available, and the win screen offers the next one.

**Operation Sandglass.** Coastal desert. Destroy the coastal radar to reveal the full map, clear three SAM sites, level the prison and fly its four POWs back to the LZ, destroy the headquarters bunker, then return to the landing zone.

**Operation Green Fang.** Jungle river valley. Sink the three patrol gunboats, destroy the generator at the dam so every gun and missile battery wired to the grid goes quiet, rescue a downed recon crew from a temple ruin, level both hangars and the fuel dump at a hidden airstrip, then return to the landing zone.

**Operation White Silence.** Arctic missile field beside a frozen sea. Blind two early-warning radomes, destroy the launch control bunker, cut the fuel convoy, recover a transport crew from a wreck on the ice, then destroy three missile silos. Hitting a silo while the bunker still stands starts a two and a half minute launch countdown; if it lapses, the missiles launch and the mission is lost.

**Operation Narrow Water.** Strait of Hormuz. Two tankers steam north up a marked lane while minelayers seed it, gunboats sortie from a naval base and anti-ship batteries fire from the cliffs. Take the island radar, sink the minelayers, sweep the mines, keep at least one tanker alive to the northern exit (both, for full marks), silence the batteries and destroy the base.

The sea is a real spectral ocean, ported from Techartist's MIT-licensed [ocean-simulation](https://github.com/iamtechartist/ocean-simulation) into TSL so it runs on the WebGPU renderer and its WebGL fallback: a JONSWAP spectrum in three FFT cascades (`src/game/world/water/Cascade.ts`, about 45 small render passes a frame), a coastal travel-time field solved once from the seabed so crests slow, turn parallel to the beach and break in the shallows (`Coastal.ts`, `WaveField.ts`), and a 15 Hz surf-foam history advected along the shore (`Foam.ts`). Each theme sets its swell direction, peak wavelength and cascade gains in `Theme.ts`. Reflections, refraction and caustics from the original are deliberately left out.

**Operation Reef Knot.** An island chain in open ocean. The enemy network is spread thin across it: a radar on the high peak, a fuel and ammunition dump in a lagoon, a submarine pen cut into a cliff, and four patrol boats working the water between the islands. Blind the radar first, sink the boats, burn the dump, break the pen, then lift three downed aircrew off a reef in the north and bring them home. There is no friendly ground but the cay you launch from and the carrier standing off it, so fuel is the real enemy.

**Operation Black Water.** A bayou of pools and mud banks under cypress, with one channel winding through it and a few hummocks that stay dry. A wartime research station on the highest of them has been reopened, and its old garrison has been coming up out of three concrete crypts. The dead wade, shamble toward the aircraft and keep coming while a crypt stands, and more rise out of the pools themselves: mist lies on the still water in patches, and every so often one near the aircraft starts to boil and a walker surfaces from it. They can only claw at the skids while the aircraft hangs slow enough to winch; the officers among them still carry rifles. Blind the radio mast, burn the three crypts, lift six surveyors off the two dry banks of a stilt village, sink the three channel gunboats, destroy the laboratory inside its walls and flak, then return to the landing zone.

Missions are data: `src/game/data/mission*.ts` holds the layout, spawns, objectives and a theme (`src/game/world/Theme.ts`) covering ground, sky, water, fog, dust and vegetation. Terrain shape, coast, river and islands come from a per-mission terrain config in `src/game/world/Terrain.ts`. The `atoll` shape is a seabed that never breaks the surface, so an archipelago is built entirely from its islands list.

## Project layout

```
app/                    Next.js App Router shell (client-only game component)
src/components/         React HUD, minimap and menu screens
src/game/Game.ts        renderer, loop, screen flow
src/game/World.ts       one mission of gameplay state
src/game/entities/      helicopter, projectiles, enemies, structures, pickups
src/game/world/         terrain heightfield, TSL terrain and water materials, sky, props
src/game/fx/            CPU-simulated particles rendered as instanced sprites
src/game/systems/       camera rig, synthesised audio, mission objectives
src/game/data/          balance tunables and the mission layout
scripts/fetch-assets.mjs  downloads the optional glTF vehicle models
```

## Assets

Vehicle models are fetched by `node scripts/fetch-assets.mjs` into `public/models`. The helicopter and vehicles are from Zsky's "Low Poly Military Vehicles" (CC-BY 4.0) and the main tank is by Quaternius (CC0), both via Poly Pizza. Any model that is missing is replaced by a primitive placeholder built in code, so the game always runs. See `public/CREDITS.md`.

All sound is synthesised at runtime with the Web Audio API. There are no audio files.

## Deploy

The app is a static Next.js build with no server code, deployed on Vercel from
this repository. Pushing to `main` builds and promotes to production; every
other branch gets its own preview URL.

Production: https://thunder-strike-umber.vercel.app

To build and serve it locally:

```
npm run build
npm start
```
