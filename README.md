# Thunder Strike

A browser tribute to Desert Strike (Electronic Arts, 1992): an isometric attack helicopter, three weapons, finite fuel and armour, a desert province full of enemy emplacements, supply crates to winch up and prisoners to bring home.

Built with Next.js 16, TypeScript and Three.js on the WebGPU renderer with TSL node materials. Browsers without WebGPU fall back to WebGL 2 automatically.

## Play

```
npm install
npm run dev
```

Open http://localhost:3000. Add `?webgl=1` to force the WebGL 2 backend, `?nopost=1` to disable bloom.

| Key | Action |
| --- | --- |
| W / Up | Forward thrust |
| S / Down | Brake and reverse |
| A D / Left Right | Rotate |
| Q / E | Strafe |
| Space | Fire selected weapon |
| 1 2 3 / Tab | Chain gun, Hydra rockets, Hellfire missiles |
| Mouse wheel | Zoom |
| Esc / P | Pause |
| M | Mute |

Hover slowly over a crate or a POW and the winch engages on its own. Bring POWs back to the landing zone on the beach, which also refuels and repairs the aircraft.

## Mission: Operation Sandglass

1. Destroy the coastal radar station (unlocks the full minimap picture).
2. Destroy all three SAM sites.
3. Level the prison and rescue the four POWs to the LZ.
4. Destroy the enemy headquarters bunker.
5. Return to the landing zone.

Three lives. Running out of fuel or armour costs one.

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

The app is a static Next.js build with no server code. On Vercel, import the repository or run `vercel` in this directory; the framework is detected automatically.

```
npm run build
npm start
```
