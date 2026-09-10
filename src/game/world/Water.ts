import * as THREE from "three/webgpu";
import { color, float, mix, mx_noise_float, positionWorld, smoothstep, time, vec2 } from "three/tsl";
import type { WaterPalette } from "./Theme";

/** Flat animated water plane at y = 0 covering the whole map. */
export function createWater(size: number, pal: WaterPalette): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size * 1.6, size * 1.6, 1, 1);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshStandardNodeMaterial();
  const xz = positionWorld.xz;
  // Two octaves of 2D noise with drifting coordinates. Feeding time in as a
  // third dimension reads the same but costs 3D perlin per pixel, and the sea
  // covers most of the screen whenever the coast is in view.
  const t = time.mul(0.9);
  const n1 = mx_noise_float(xz.mul(0.045 * pal.scale).add(vec2(t.mul(0.5), t.mul(0.3)))).mul(0.5).add(0.5);
  const n2 = mx_noise_float(xz.mul(0.18 * pal.scale).add(50).add(vec2(t.mul(-0.9), t.mul(0.6)))).mul(0.5).add(0.5);
  const deep = color(pal.deep);
  const shallow = color(pal.shallow);
  const foam = color(pal.foam);
  let col = mix(deep, shallow, n1);
  // Foam streaks where the second octave peaks.
  col = mix(col, foam, smoothstep(0.72, 0.9, n2).mul(pal.foamAmount));

  mat.colorNode = col;
  mat.roughnessNode = float(0.25);
  mat.metalnessNode = float(0.05);
  // Opaque: at 0.92 the seabed was barely visible anyway, and blending a plane
  // this large forced every pixel through the transparent pass.

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.name = "water";
  return mesh;
}
