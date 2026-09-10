import * as THREE from "three/webgpu";
import { color, mix, positionWorld, smoothstep } from "three/tsl";
import type { SkyPalette } from "./Theme";

/** Gradient dome drawn from the inside, unaffected by fog. */
export function createSky(radius: number, pal: SkyPalette): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 24, 16);
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.side = THREE.BackSide;
  mat.fog = false;
  mat.depthWrite = false;
  const up = positionWorld.normalize().y;
  const haze = color(pal.haze);
  const horizon = color(pal.horizon);
  const zenith = color(pal.zenith);
  let col = mix(horizon, zenith, smoothstep(0.02, 0.45, up));
  col = mix(haze, col, smoothstep(-0.05, 0.08, up));
  mat.colorNode = col;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "sky";
  mesh.frustumCulled = false;
  return mesh;
}

export function createSun(pal: SkyPalette): { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight } {
  const sun = new THREE.DirectionalLight(pal.sun, 3.0);
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
  // Penumbra width in texels for the PCF filter; cascades inherit it.
  sun.shadow.radius = 2.2;
  const hemi = new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, 0.7);
  return { sun, hemi };
}
