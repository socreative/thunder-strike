import * as THREE from "three/webgpu";
import { cameraPosition, color, dot, float, mix, mx_noise_float, mx_noise_vec3, normalize, positionWorld, pow, saturate, smoothstep, texture, time, transformNormalToView, vec2, vec3 } from "three/tsl";
import type { WaterPalette } from "./Theme";

/**
 * Water plane at y = 0 covering the whole map. Colour follows the depth of the
 * terrain beneath it (baked into a small height texture), the surface carries
 * animated bump normals so the sun glints and the sky reflects at grazing
 * angles, foam gathers on wave crests and along the shoreline, and the sand
 * shows through in the last couple of metres before the beach.
 */
export function createWater(size: number, pal: WaterPalette, heights: THREE.DataTexture, mapSize: number, skyColor: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size * 1.6, size * 1.6, 1, 1);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshStandardNodeMaterial();
  const xz = positionWorld.xz;
  const t = time;

  // Terrain height under this pixel, decoded from the 8-bit bake: h = r * 40 - 20.
  const uvMap = xz.div(mapSize).add(0.5);
  const ground = texture(heights, uvMap).r.mul(40).sub(20);
  const depth = ground.negate();

  // Two scrolling octaves of vector noise: xy tilt the surface, z picks out crests.
  const s1 = 0.06 * pal.scale;
  const s2 = 0.2 * pal.scale;
  const n1 = mx_noise_vec3(vec3(xz.mul(s1).add(vec2(t.mul(0.32), t.mul(0.2))), t.mul(0.12)));
  const n2 = mx_noise_vec3(vec3(xz.mul(s2).add(vec2(t.mul(-0.55), t.mul(0.42))), t.mul(0.28)));
  // Swell flattens as the water shoals.
  const calm = smoothstep(0.5, 6, depth).mul(0.7).add(0.3);
  const slope = n1.xy.mul(0.34).add(n2.xy.mul(0.2)).mul(calm);
  const nWorld = normalize(vec3(slope.x, 1, slope.y));
  mat.normalNode = transformNormalToView(nWorld);

  // Body colour: deep to shallow by depth, then the bottom showing through near the beach.
  const deep = color(pal.deep);
  const shallow = color(pal.shallow);
  const foam = color(pal.foam);
  const shoal = smoothstep(16, 1.2, depth);
  let col = mix(deep, shallow, shoal);
  const bottom = smoothstep(2.8, 0.15, depth);
  col = mix(col, color(pal.bed ?? 0xc2ae86), bottom.mul(0.6));

  // Foam: on crests of the fine swell, and a breathing band along the shore.
  const crest = smoothstep(0.76, 0.96, n2.z.mul(0.5).add(0.5)).mul(pal.foamAmount * 0.6);
  const shoreNoise = mx_noise_float(xz.mul(0.3).add(vec2(t.mul(0.5), t.mul(0.1)))).mul(0.5).add(0.5);
  const surge = t.mul(1.1).add(depth.mul(1.8)).sin().mul(0.18);
  const shoreBand = smoothstep(1.9, 0.2, depth).mul(smoothstep(0.38, 0.78, shoreNoise.add(surge))).mul(0.85);
  const foamK = saturate(crest.add(shoreBand));
  col = mix(col, foam, foamK);

  // Sky reflected at grazing angles on the tilted surface.
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const fresnel = pow(saturate(float(1).sub(dot(nWorld, viewDir))), 3).mul(0.9);
  col = mix(col, color(skyColor), saturate(fresnel));

  mat.colorNode = col;
  // Glassy where clear, matte where foamed.
  mat.roughnessNode = mix(float(0.14), float(0.7), foamK);
  mat.metalnessNode = float(0.02);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.name = "water";
  return mesh;
}
