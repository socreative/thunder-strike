import * as THREE from "three/webgpu";
import { color, float, mix, mx_noise_float, normalWorld, positionWorld, smoothstep } from "three/tsl";

/**
 * Sand and rock blended by slope with two octaves of procedural detail, a
 * darker damp band at the shoreline and faint ripples on the flats.
 */
export function createTerrainMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();

  const xz = positionWorld.xz;
  const slope = normalWorld.y.oneMinus();

  const nLarge = mx_noise_float(xz.mul(0.012)).mul(0.5).add(0.5);
  const nMid = mx_noise_float(xz.mul(0.09).add(31.7)).mul(0.5).add(0.5);
  const nFine = mx_noise_float(xz.mul(0.6).add(7.3)).mul(0.5).add(0.5);

  // Wind ripples: thin stripes modulated by noise so they break up.
  const ripple = xz.x.mul(0.9).add(xz.y.mul(0.35)).add(nMid.mul(6)).sin().mul(0.5).add(0.5);
  const rippleAmount = ripple.mul(0.06).mul(slope.oneMinus());

  const sandLight = color(0xe0c07f);
  const sandDark = color(0xc59d5c);
  const sand = mix(sandDark, sandLight, nLarge).mul(nFine.mul(0.14).add(0.93)).add(rippleAmount);

  const rockA = color(0x8f6f4c);
  const rockB = color(0x5f4a35);
  const rock = mix(rockA, rockB, nMid);

  const rockMix = smoothstep(0.16, 0.42, slope.add(nFine.mul(0.08)));
  let col = mix(sand, rock, rockMix);

  // Wet sand near the water line, then a greenish tint just under it.
  const y = positionWorld.y;
  const wet = smoothstep(0.6, 3.2, y).oneMinus();
  col = mix(col, color(0x8f7d59), wet);
  const under = smoothstep(-4, 0.2, y).oneMinus();
  col = mix(col, color(0x4e6a5e), under);

  mat.colorNode = col;
  mat.roughnessNode = float(0.96);
  mat.metalnessNode = float(0);
  return mat;
}
