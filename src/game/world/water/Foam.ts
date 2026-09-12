import * as THREE from "three/webgpu";
import type { Node } from "three/webgpu";
import { clamp, cos, dot, exp, float, fract, inverseSqrt, length, max, min, mix, screenCoordinate, sin, smoothstep, step, texture, uniform, vec2, vec3, vec4 } from "three/tsl";
import { fftTarget } from "./Cascade";
import type { WaveField } from "./WaveField";

/*
 * Surf foam history: a map-wide field of (foam, fresh foam, swash, wetness)
 * advected each tick by the wave-driven flow, fed by breaking crests and
 * swash running up the beach, and decaying with age. Ported from the wide
 * level of Techartist's ocean-simulation foam system (MIT); the near level
 * and the rock terms are dropped, the camera never gets low enough to see
 * them and our maps carry no rock mask.
 */

const INTERVAL = 1 / 15;

function hash12(p: Node<"vec2">): Node<"float"> {
  let p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031));
  p3 = p3.add(dot(p3, vec3(p3.y, p3.z, p3.x).add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
}

export function noise2(p: Node<"vec2">): Node<"float"> {
  const i = p.floor();
  const f = fract(p);
  const u = f.mul(f).mul(float(3).sub(f.mul(2)));
  return mix(mix(hash12(i), hash12(i.add(vec2(1, 0))), u.x), mix(hash12(i.add(vec2(0, 1))), hash12(i.add(1)), u.x), u.y);
}

export function fractalNoise(p: Node<"vec2">): Node<"float"> {
  const turn = (q: Node<"vec2">) => vec2(q.x.mul(0.8).sub(q.y.mul(0.6)), q.x.mul(0.6).add(q.y.mul(0.8)));
  let f = noise2(p).mul(0.55);
  let q = turn(p).mul(2.03).add(17.1);
  f = f.add(noise2(q).mul(0.28));
  q = turn(q).mul(2.07).sub(9.2);
  return f.add(noise2(q).mul(0.17));
}

export class FoamField {
  readonly size: number;
  private readonly targets: [THREE.RenderTarget, THREE.RenderTarget];
  private index = 0;
  private elapsed = 0;
  private primed = false;
  /** One material per source target: WebGPU forbids binding the texture being rendered into. */
  private readonly materials: [THREE.NodeMaterial, THREE.NodeMaterial];
  private readonly clearMat: THREE.NodeMaterial;
  private readonly uDelta = uniform(1 / 15);

  constructor(wave: WaveField, heights: THREE.Texture, mapSize: number, time: Node<"float">, size = 512) {
    this.size = size;
    const make = () => {
      const t = fftTarget(size, false);
      t.texture.minFilter = THREE.LinearFilter;
      t.texture.magFilter = THREE.LinearFilter;
      return t;
    };
    this.targets = [make(), make()];

    const build = (prev: number): THREE.NodeMaterial => {
      const uv = screenCoordinate.div(size);
      const p = uv.sub(0.5).mul(mapSize);
      const previousAt = (at: Node<"vec2">) => {
        const puv = at.div(mapSize).add(0.5);
        const inside = step(max(puv.x.sub(0.5).abs(), puv.y.sub(0.5).abs()), 0.496);
        const cuv = clamp(puv, 0.001, 0.999);
        return texture(this.targets[prev].texture, cuv).mul(inside);
      };
      const bedH = wave.bedHeight(p);
      const interactionDepth = max(float(0.05), bedH.negate());
      const footprint = float(mapSize / size);

      // Offshore: nothing new is made, existing foam drifts with the wind and fades.
      const driftOld = previousAt(p.sub(wave.p.windDir.mul(wave.p.surfaceWind.mul(0.18).add(0.22)).mul(this.uDelta)));
      const drift = vec4(driftOld.r.mul(exp(this.uDelta.div(-4))), driftOld.g.mul(exp(this.uDelta.mul(-0.85))), 0, 0);

      // Surf zone.
      const stepSize = 1.8;
      const grad = vec2(
        wave.bedHeight(p.add(vec2(stepSize, 0))).sub(wave.bedHeight(p.sub(vec2(stepSize, 0)))),
        wave.bedHeight(p.add(vec2(0, stepSize))).sub(wave.bedHeight(p.sub(vec2(0, stepSize)))),
      ).div(2 * stepSize);
      const inland = grad.mul(inverseSqrt(max(dot(grad, grad), 1e-8)));
      const coast = wave.coastField(p);
      const depth = max(float(0.05), bedH.negate());
      const disp = wave.waveDisplacement(p, footprint);
      const slope = wave.waveSlope(p, footprint);
      const compression = smoothstep(0.3, 0.75, length(slope)).mul(smoothstep(0.1, 0.8, disp.y));
      const breaking = clamp(wave.breakerPotential(p, disp.y, compression), 0, 1);
      const local = previousAt(p);
      // The bore arriving from offshore, delayed by its run up the beach.
      const shoreSource = p.sub(inland.mul(max(float(0), bedH).mul(5).add(10)));
      const arriving = wave.waveDisplacement(shoreSource, float(0.65));
      const runPulse = smoothstep(-0.1, 0.4, arriving.y);
      const surf = float(1).sub(smoothstep(0.4, 6, depth));
      let flow = coast.yz.mul(breaking.mul(1.7).add(0.32)).add(wave.p.windDir.mul(wave.p.surfaceWind).mul(0.14).mul(coast.a));
      flow = flow.add(inland.mul(surf).mul(runPulse.mul(1.8).sub(0.65).sub(local.b.mul(0.35))));
      const eddy = sin(dot(p, vec2(0.52, 0.37)).sub(time.mul(0.8))).mul(cos(dot(p, vec2(-0.27, 0.43)).add(time.mul(0.57))));
      flow = flow.add(vec2(grad.y.negate(), grad.x).mul(clamp(local.r.mul(1.8), 0, 3)).mul(eddy));
      const speed = length(flow);
      flow = flow.mul(min(float(1), float(4.5).div(max(float(0.001), speed))));
      const old = previousAt(p.sub(flow.mul(this.uDelta)));
      const life = mix(2.8, 7, coast.a);
      let foam = old.r.mul(exp(this.uDelta.negate().div(life)));
      let fresh = old.g.mul(exp(this.uDelta.mul(-0.85)));
      const shallowSlope = length(grad);
      const runupGain = mix(1.55, 0.8, smoothstep(0.1, 0.45, shallowSlope));
      let reach = clamp(max(float(0), arriving.y).mul(runupGain).add(breaking.mul(0.23)).add(0.08), 0, 1.6);
      reach = reach.mul(noise2(p.mul(0.29).add(flow.mul(time).mul(0.06))).mul(0.2).add(0.8));
      const water = max(float(0), reach.sub(bedH)).mul(float(1).sub(smoothstep(0.5, 2, bedH)));
      const rate = mix(float(0.75), float(4), step(local.b, water));
      const swash = mix(local.b, clamp(water, 0, 0.22), float(1).sub(exp(this.uDelta.negate().mul(rate))));
      const surfSource = float(1).sub(smoothstep(14, 28, interactionDepth));
      let source = breaking.mul(0.5).add(compression.mul(0.025).mul(coast.a)).mul(surfSource);
      source = source.add(smoothstep(0.025, 0.11, swash).mul(float(1).sub(smoothstep(0, 0.45, swash))).mul(smoothstep(-0.35, 0.08, bedH)).mul(runPulse).mul(0.1));
      const deposited = float(1).sub(exp(this.uDelta.negate().mul(source).mul(1.7)));
      foam = clamp(foam.add(float(1).sub(foam).mul(deposited)), 0, 1);
      fresh = max(fresh, deposited.mul(3.5));
      const wet = max(local.a.mul(exp(this.uDelta.div(-38))), smoothstep(0.008, 0.07, swash));
      const full = vec4(foam, clamp(fresh, 0, 1), swash, wet);

      // Masks rather than branches: a conditional block around render-target
      // reads has no function stack for the GLSL flip-Y helper to attach to.
      const wet_ = float(1).sub(step(2.1, bedH)).mul(float(1).sub(step(40, interactionDepth)));
      const offshore = step(28, interactionDepth);
      const out = mix(full, drift, offshore).mul(wet_);
      const mat = new THREE.NodeMaterial();
      mat.fragmentNode = out;
      mat.depthTest = false;
      mat.depthWrite = false;
      mat.name = "foam-pass";
      return mat;
    };
    this.materials = [build(0), build(1)];
    this.clearMat = new THREE.NodeMaterial();
    this.clearMat.fragmentNode = vec4(0);
    this.clearMat.depthTest = false;
    this.clearMat.depthWrite = false;
  }

  get texture(): THREE.Texture {
    return this.targets[this.index].texture;
  }

  /** Advance the history when its tick is due. Returns true if the texture changed. */
  update(renderer: THREE.WebGPURenderer, quad: THREE.QuadMesh, dt: number): boolean {
    if (!this.primed) {
      quad.material = this.clearMat;
      for (const t of this.targets) {
        renderer.setRenderTarget(t);
        quad.render(renderer);
      }
      this.primed = true;
    }
    this.elapsed += dt;
    if (this.elapsed < INTERVAL) return false;
    const tick = Math.min(this.elapsed, 0.12);
    this.elapsed = 0;
    this.uDelta.value = tick;
    quad.material = this.materials[this.index];
    this.index = 1 - this.index;
    renderer.setRenderTarget(this.targets[this.index]);
    quad.render(renderer);
    return true;
  }

  dispose(): void {
    for (const t of this.targets) t.dispose();
    for (const m of this.materials) m.dispose();
    this.clearMat.dispose();
  }
}
