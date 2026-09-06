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

- **Gerald Ford Aircraft Carrier** by Uxman, CC-BY 4.0, https://sketchfab.com/3d-models/gerald-ford-aircraft-carrier-324120997379466caad30917911bcd8b

The carrier is downloaded manually from Sketchfab, then reduced for the web with
`@gltf-transform/cli optimize --texture-size 1024 --texture-compress webp`,
which takes it from 8.5 MB to about 320 KB. If it is missing the game builds a
procedural carrier instead.

Zsky's and Uxman's models are licensed under Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/).
Quaternius models are CC0 (public domain).

## Music

"Iron Sector Run", generated with Suno by the project author.

## Sound

All sound effects are synthesised at runtime with the Web Audio API.

## Artwork

Title artwork and logo generated with Nano Banana Pro.
