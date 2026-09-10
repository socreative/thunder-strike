import * as THREE from "three/webgpu";
import type { Node } from "three/webgpu";
import { cameraPosition, color, dot, float, mix, mx_noise_float, mx_noise_vec3, normalize, positionLocal, positionWorld, pow, saturate, smoothstep, texture, time, transformNormalToView, vec2, vec3 } from "three/tsl";
import type { WaterPalette } from "./Theme";

/** Vertex grid spacing in metres; the shortest swell below spans four cells. */
const GRID_CELL = 4;

/**
 * Three Gerstner swells: direction, wavelength, amplitude and a speed factor.
 * Directions differ so the sum never marches in one line, and the shortest
 * wave carries the choppy detail the shading picks up.
 */
const SWELLS: { dir: [number, number]; length: number; amp: number; speed: number }[] = [
  { dir: [0.82, 0.57], length: 46, amp: 0.42, speed: 1.0 },
  { dir: [-0.35, 0.94], length: 27, amp: 0.26, speed: 1.15 },
  { dir: [0.6, -0.8], length: 16, amp: 0.14, speed: 1.3 },
];

/**
 * Water plane at y = 0 covering the whole map. The mesh is a real grid that
 * rides three Gerstner swells, so the waterline advances and retreats up the
 * beach with each wave. Colour follows the depth of the terrain beneath
 * (baked into a small height texture), the surface carries wave and ripple
 * normals for sun glints and a sky tint at grazing angles, foam breaks on
 * crests that steepen over the shallows and washes up the shore in bands, and
 * the sand shows through in the last couple of metres before the beach.
 */
export function createWater(size: number, pal: WaterPalette, heights: THREE.DataTexture, mapSize: number, skyColor: number): THREE.Mesh {
  const span = size * 1.6;
  const segments = Math.round(span / GRID_CELL);
  const geo = new THREE.PlaneGeometry(span, span, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshStandardNodeMaterial();
  const t = time;

  // Terrain height under a point, decoded from the 8-bit bake: h = r * 40 - 20.
  const groundAt = (xz: Node<"vec2">) => texture(heights, xz.div(mapSize).add(0.5)).r.mul(40).sub(20);
  const sum = (parts: Node<"float">[]) => parts.reduce((a, b) => a.add(b));

  /* Vertex stage: Gerstner displacement, damped as the water shoals. */
  const lxz = positionLocal.xz;
  const vDepth = groundAt(lxz).negate();
  const damp = smoothstep(0.2, 5, vDepth);
  // Crests sharpen as the wave slows over shallow ground.
  const steep = float(0.55).add(smoothstep(6, 1, vDepth).mul(0.4));
  const vertexWaves = SWELLS.map((w) => {
    const k = (2 * Math.PI) / w.length;
    const omega = Math.sqrt(9.81 * k) * w.speed;
    const phase = lxz.x.mul(w.dir[0] * k).add(lxz.y.mul(w.dir[1] * k)).sub(t.mul(omega));
    const amp = float(w.amp).mul(damp);
    return { x: amp.mul(steep).mul(w.dir[0]).mul(phase.cos()), y: amp.mul(phase.sin()), z: amp.mul(steep).mul(w.dir[1]).mul(phase.cos()) };
  });
  const dispX = sum(vertexWaves.map((v) => v.x));
  const dispY = sum(vertexWaves.map((v) => v.y));
  const dispZ = sum(vertexWaves.map((v) => v.z));
  mat.positionNode = positionLocal.add(vec3(dispX, dispY, dispZ));

  /* Fragment stage: the same waves evaluated at the world position for normals and foam. */
  const xz = positionWorld.xz;
  const ground = groundAt(xz);
  const depth = ground.negate();
  const fDamp = smoothstep(0.2, 5, depth);
  const fragWaves = SWELLS.map((w) => {
    const k = (2 * Math.PI) / w.length;
    const omega = Math.sqrt(9.81 * k) * w.speed;
    const phase = xz.x.mul(w.dir[0] * k).add(xz.y.mul(w.dir[1] * k)).sub(t.mul(omega));
    const amp = float(w.amp).mul(fDamp);
    return { sx: amp.mul(w.dir[0] * k).mul(phase.cos()), sz: amp.mul(w.dir[1] * k).mul(phase.cos()), h: amp.mul(phase.sin()) };
  });
  const slopeX = sum(fragWaves.map((v) => v.sx));
  const slopeZ = sum(fragWaves.map((v) => v.sz));
  const height = sum(fragWaves.map((v) => v.h));
  const ampSum = SWELLS.reduce((a, w) => a + w.amp, 0);
  // Ripples on top of the swell: two scrolling octaves of vector noise.
  const s1 = 0.07 * pal.scale;
  const s2 = 0.22 * pal.scale;
  const n1 = mx_noise_vec3(vec3(xz.mul(s1).add(vec2(t.mul(0.3), t.mul(0.18))), t.mul(0.12)));
  const n2 = mx_noise_vec3(vec3(xz.mul(s2).add(vec2(t.mul(-0.5), t.mul(0.4))), t.mul(0.28)));
  const ripple = n1.xy.mul(0.22).add(n2.xy.mul(0.14)).mul(fDamp.mul(0.7).add(0.3));
  const nWorld = normalize(vec3(slopeX.negate().mul(1.6).add(ripple.x), 1, slopeZ.negate().mul(1.6).add(ripple.y)));
  mat.normalNode = transformNormalToView(nWorld);

  /* Colour. */
  const deep = color(pal.deep);
  const shallow = color(pal.shallow);
  const foam = color(pal.foam);
  const shoal = smoothstep(16, 1.2, depth);
  let col = mix(deep, shallow, shoal);
  // Crests catch light, troughs sit darker.
  const relief = height.div(ampSum).mul(0.5).add(0.5);
  col = col.mul(relief.mul(0.3).add(0.85));
  const bottom = smoothstep(2.8, 0.15, depth);
  col = mix(col, color(pal.bed ?? 0xc2ae86), bottom.mul(0.6));

  /* Foam. */
  const breakup = mx_noise_float(xz.mul(0.35).add(vec2(t.mul(0.4), t.mul(-0.2)))).mul(0.5).add(0.5);
  // Whitecaps: the top of a crest, far more of it where the swell steepens over the shallows.
  const crestness = smoothstep(0.55, 0.95, relief);
  const breaking = smoothstep(9, 1.5, depth).mul(0.8).add(0.12);
  const whitecap = crestness.mul(breaking).mul(smoothstep(0.3, 0.75, breakup)).mul(pal.foamAmount * 1.1);
  // Surf: lines of foam running up the beach with the waves, thickest at the water line.
  const surge = depth.mul(2.4).sub(t.mul(1.8)).add(breakup.mul(3)).sin();
  const lines = smoothstep(0.45, 0.92, surge).mul(smoothstep(3.0, 0.5, depth));
  const edge = smoothstep(0.9, 0.1, depth).mul(smoothstep(0.3, 0.7, breakup.add(height.mul(0.4))));
  const foamK = saturate(whitecap.add(lines.mul(0.6)).add(edge));
  col = mix(col, foam, foamK);

  /* Sky at grazing angles. */
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const schlick = pow(saturate(float(1).sub(dot(nWorld, viewDir))), 3);
  col = mix(col, color(skyColor), saturate(schlick.mul(0.6)));

  mat.colorNode = col;
  mat.roughnessNode = mix(float(0.14), float(0.75), foamK);
  mat.metalnessNode = float(0.02);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.name = "water";
  mesh.frustumCulled = false;
  return mesh;
}
