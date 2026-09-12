# Credits

Thunder Strike is a tribute to Desert Strike (Electronic Arts, 1992).

## 3D models

Models fetched by `scripts/fetch-assets.mjs`. Where a model is missing the game builds a primitive placeholder.

- **Helicopter** by Zsky, CC-BY 4.0, https://poly.pizza/m/hG2Qr0A3zR
- **Tank** by Quaternius, CC0, https://poly.pizza/m/jWS1CLA0RO
- **Tank** by Zsky, CC-BY 4.0, https://poly.pizza/m/7GG1xDtc8l
- **Jeep** by Zsky, CC-BY 4.0, https://poly.pizza/m/AcSdGGrgYP
- **Truck** by Zsky, CC-BY 4.0, https://poly.pizza/m/EWp0hGvZPV
- **Light Tank** by Zsky, CC-BY 4.0, https://poly.pizza/m/S1jUTRmAjD
- **Military Boat** by Zsky, CC-BY 4.0, https://poly.pizza/m/wouBxOe3CD

- **AH-64 Apache** by Thomas Koenders, CC-BY 4.0, https://sketchfab.com/3d-models/ah-64-apache-715f96dc3e484a4da943302142abe5d2
- **Gerald Ford Aircraft Carrier** by Uxman, CC-BY 4.0, https://sketchfab.com/3d-models/gerald-ford-aircraft-carrier-324120997379466caad30917911bcd8b
- **F-16 Fighter Jet** by iedalton, CC-BY 4.0, https://sketchfab.com/3d-models/f-16-fighter-jet-d84491f443384ee488593cc6f0f0839e
- **Jungle Tent** by SyntheticMN, CC-BY 4.0, https://sketchfab.com/3d-models/jungle-tent-52332b0f55f24c739215342954e49f54
- **Patrol Boat PBR MK2** by Savy, CC-BY 4.0, https://sketchfab.com/3d-models/patrol-boat-pbr-mk2-dbd87172b2934063aa93ffd0c6f85750
- **Hellfire Missile** by xephoney, CC-BY 4.0, https://sketchfab.com/3d-models/hellfire-missile-208e1de6721e439cbb1666ec9a6517e5
- **Missiles** by Civorsky, CC-BY 4.0, https://sketchfab.com/3d-models/missiles-37899978144a45d0bd03c3538957b145. The AIM-54C from the collection flies as the surface-to-air missile, reduced to about 1,500 triangles in a single draw call with each part's texture averaged to one colour and baked into the vertices.
- **Spike LR2 anti-tank anti-personnel rocket** by s_ebo_l, CC-BY 4.0, https://sketchfab.com/3d-models/spike-lr2-anti-tank-anti-personnel-rocket-e47685a48cdb4e14883976fe1bf85ced. Flown as the rocket pod round. Reduced for the game to the body, seeker dome, collar and fins at about 1,100 triangles in a single draw call, with the PBR maps replaced by colours baked into the vertices.

Those four are downloaded manually from Sketchfab, then reduced for the web
with `@gltf-transform/cli optimize --texture-compress webp` and a texture size
cap. Together they go from about 70 MB to 2.6 MB. Where any model is missing the
game builds a procedural stand-in instead.

The models above are licensed under Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/).
Quaternius models are CC0 (public domain).

## Water

The sea's wave model (JONSWAP spectrum, three-cascade GPU FFT, seabed travel-time field for refraction and shoaling, Jacobian whitecaps and the advected surf-foam history) is ported from [ocean-simulation](https://github.com/iamtechartist/ocean-simulation) by Techartist, MIT License, rewritten from GLSL into three.js TSL node materials. The upstream licence is kept in `LICENSES/ocean-simulation.txt`.

## Music

"Iron Sector Run", "Jungle Advance", "Arctic Front", "March of the Sands" and "Salt Air Stance", generated with Suno by the project author. Encoded from the masters as Opus at 160 kbps and MP3 at 256 kbps; the browser takes Opus wherever it can.

## Sound

Helicopter rotor loop cut from a recording by freesound_community (Pixabay Content License). All other sound effects are synthesised at runtime with the Web Audio API.

## Artwork

Title artwork and logo generated with Nano Banana Pro; app icon generated with Nano Banana Pro via Higgsfield.
