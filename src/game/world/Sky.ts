import * as THREE from "three/webgpu";
import { color, mix, positionWorld, smoothstep } from "three/tsl";

export const SKY_HORIZON = 0xe6d3b0;
export const SKY_ZENITH = 0x6f9fc9;

/** Gradient dome drawn from the inside, unaffected by fog. */
export function createSky(radius: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 24, 16);
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.side = THREE.BackSide;
  mat.fog = false;
  mat.depthWrite = false;
  const up = positionWorld.normalize().y;
  const haze = color(0xf3e4c4);
  const horizon = color(SKY_HORIZON);
  const zenith = color(SKY_ZENITH);
  let col = mix(horizon, zenith, smoothstep(0.02, 0.45, up));
  col = mix(haze, col, smoothstep(-0.05, 0.08, up));
  mat.colorNode = col;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "sky";
  mesh.frustumCulled = false;
  return mesh;
}

export function createSun(): { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight } {
  const sun = new THREE.DirectionalLight(0xfff0d6, 3.0);
  sun.castShadow = true;
  // With cascaded shadows this is the resolution of each cascade, so a slice
  // near the aircraft gets the whole map to itself. It is also the fallback
  // single-map size if cascades cannot be created.
  sun.shadow.mapSize.set(1536, 1536);
  const cam = sun.shadow.camera;
  cam.left = -180;
  cam.right = 180;
  cam.top = 180;
  cam.bottom = -180;
  cam.near = 10;
  cam.far = 760;
  // Small offsets: at cascade resolution a large normal bias detaches contact
  // shadows and coarsens every edge.
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.12;
  const hemi = new THREE.HemisphereLight(0x9fb9d6, 0x8a6b45, 0.7);
  return { sun, hemi };
}
