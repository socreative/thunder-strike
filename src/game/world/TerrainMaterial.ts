import * as THREE from "three/webgpu";
import { color, float, mix, mx_noise_float, normalWorld, positionWorld, smoothstep } from "three/tsl";
import type { GroundPalette } from "./Theme";

/**
 * Ground and rock blended by slope with two octaves of procedural detail, a
 * darker damp band at the shoreline and, on sand, faint wind ripples.
 */
export function createTerrainMaterial(pal: GroundPalette): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();

  const xz = positionWorld.xz;
  const slope = normalWorld.y.oneMinus();

  const nLarge = mx_noise_float(xz.mul(0.012)).mul(0.5).add(0.5);
  const nMid = mx_noise_float(xz.mul(0.09).add(31.7)).mul(0.5).add(0.5);
  const nFine = mx_noise_float(xz.mul(0.6).add(7.3)).mul(0.5).add(0.5);

  // Wind ripples: thin stripes modulated by noise so they break up.
  const ripple = xz.x.mul(0.9).add(xz.y.mul(0.35)).add(nMid.mul(6)).sin().mul(0.5).add(0.5);
  const rippleAmount = ripple.mul(0.06 * pal.ripple).mul(slope.oneMinus());

  const groundLight = color(pal.light);
  const groundDark = color(pal.dark);
  const ground = mix(groundDark, groundLight, nLarge).mul(nFine.mul(0.14).add(0.93)).add(rippleAmount);

  const rockA = color(pal.rockA);
  const rockB = color(pal.rockB);
  const rock = mix(rockA, rockB, nMid);

  const rockMix = smoothstep(0.16, 0.42, slope.add(nFine.mul(0.08)));
  let col = mix(ground, rock, rockMix);

  // Damp ground near the water line, then a greenish tint just under it.
  const y = positionWorld.y;
  const wet = smoothstep(0.6, 3.2, y).oneMinus();
  col = mix(col, color(pal.wet), wet);
  const under = smoothstep(-4, 0.2, y).oneMinus();
  col = mix(col, color(pal.underwater), under);

  mat.colorNode = col;
  mat.roughnessNode = float(0.96);
  mat.metalnessNode = float(0);
  return mat;
}
