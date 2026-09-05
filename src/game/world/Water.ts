import * as THREE from "three/webgpu";
import { color, float, mix, mx_noise_float, positionWorld, smoothstep, time, vec3 } from "three/tsl";

/** Flat animated sea plane at y = 0 covering the whole map. */
export function createWater(size: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size * 1.6, size * 1.6, 1, 1);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshStandardNodeMaterial();
  const xz = positionWorld.xz;
  const t = time.mul(0.25);
  const n1 = mx_noise_float(vec3(xz.mul(0.045), t)).mul(0.5).add(0.5);
  const n2 = mx_noise_float(vec3(xz.mul(0.18).add(50), t.mul(1.7))).mul(0.5).add(0.5);
  const deep = color(0x145066);
  const shallow = color(0x2b8fa3);
  const foam = color(0xcfe6ea);
  let col = mix(deep, shallow, n1);
  // Foam streaks where the second octave peaks.
  col = mix(col, foam, smoothstep(0.72, 0.9, n2).mul(0.6));

  mat.colorNode = col;
  mat.roughnessNode = float(0.25);
  mat.metalnessNode = float(0.05);
  mat.opacityNode = float(0.92);
  mat.transparent = true;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.name = "water";
  return mesh;
}
