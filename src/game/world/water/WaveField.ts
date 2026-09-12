import * as THREE from "three/webgpu";
import type { Node, TextureNode, UniformNode } from "three/webgpu";
import { abs, clamp, dot, float, inverseSqrt, log2, max, min, mix, sin, smoothstep, sqrt, tanh, texture, vec2, vec3, vec4 } from "three/tsl";
import type { Cascade } from "./Cascade";

/*
 * The shader-side wave library shared by the water surface and the foam
 * simulation: samples the three cascade tiles, bends the swell along the
 * coastal travel-time field, shoals and breaks it over the shallows. Ported
 * from the GLSL chunks of Techartist's ocean-simulation (MIT) as plain
 * functions that build TSL graphs; nodes reused within one stage are
 * emitted once by the builder.
 */

export interface WaveFieldParams {
  cascades: Cascade[];
  /** Seabed height in metres in the red channel, spanning the map. */
  heights: THREE.Texture;
  coast: THREE.Texture;
  mapSize: number;
  /** Unit direction the swell travels in. */
  swellDir: [number, number];
  /** Wavenumber of the peak swell, 2 pi over its wavelength. */
  k0: number;
  windDir: UniformNode<"vec2", THREE.Vector2>;
  swellGain: UniformNode<"float", number>;
  surfaceWind: UniformNode<"float", number>;
  time: UniformNode<"float", number>;
}

export interface WaveContext {
  c: Node<"vec4">;
  depth: Node<"float">;
  swellP: Node<"vec2">;
  windP: Node<"vec2">;
  lod: Node<"float">[];
}

type V2 = Node<"vec2">;
type F = Node<"float">;

export class WaveField {
  readonly slopeNodes: TextureNode[];
  readonly dispNodes: TextureNode[];
  private readonly base: Node<"vec2">;
  readonly p: WaveFieldParams;

  constructor(p: WaveFieldParams) {
    this.p = p;
    this.base = vec2(p.swellDir[0], p.swellDir[1]);
    this.dispNodes = p.cascades.map((c) => texture(c.displacement.texture));
    this.slopeNodes = p.cascades.map((c) => texture(c.slopeTexture));
  }

  /** Point the slope samplers at whichever target the cascades wrote last. */
  refresh(): void {
    this.p.cascades.forEach((c, i) => {
      this.slopeNodes[i].value = c.slopeTexture;
    });
  }

  /* Seabed and coastal field lookups. */

  bedHeight(p: V2): F {
    const uv = clamp(p.div(this.p.mapSize).add(0.5), 0.001, 0.999);
    return texture(this.p.heights, uv).r;
  }

  coastalDepth(p: V2): F {
    return max(float(0.05), this.bedHeight(p).negate());
  }

  coastField(p: V2): Node<"vec4"> {
    const uv = p.div(this.p.mapSize).add(0.5);
    const c = texture(this.p.coast, clamp(uv, 0.001, 0.999));
    const edge = float(1).sub(smoothstep(0.41, 0.495, max(abs(uv.x.sub(0.5)), abs(uv.y.sub(0.5)))));
    const m = mix(vec4(0, this.base.x, this.base.y, 1), c, edge);
    const d = m.yz.mul(inverseSqrt(max(dot(m.yz, m.yz), 1e-8)));
    return vec4(m.x, d.x, d.y, clamp(m.w, 0, 1));
  }

  /** Broad, slowly moving interference envelopes so the sea never looks tiled. */
  energyRegion(p: V2): F {
    const t = this.p.time;
    return float(0.88)
      .add(sin(dot(p, vec2(0.0031, 0.0017)).sub(t.mul(0.012))).mul(0.09))
      .add(sin(dot(p, vec2(-0.0013, 0.0041)).add(t.mul(0.009))).mul(0.065));
  }

  swellCoordinates(p: V2, c: Node<"vec4">): V2 {
    return p.add(this.base.mul(c.x));
  }

  windCoordinates(p: V2): V2 {
    const w = this.p.windDir;
    return vec2(dot(p, w), dot(p, vec2(w.y.negate(), w.x)));
  }

  turnSwell(v: V2, direction: V2): V2 {
    const b = this.base;
    return direction.mul(dot(v, b)).add(vec2(direction.y.negate(), direction.x).mul(dot(v, vec2(b.y.negate(), b.x))));
  }

  turnWind(v: V2): V2 {
    const w = this.p.windDir;
    return w.mul(v.x).add(vec2(w.y.negate(), w.x).mul(v.y));
  }

  /** Surf foam belongs near the shore; offshore whitecaps come from the spectrum. */
  coastalFoamSupport(depth: F): F {
    return float(1).sub(smoothstep(22, 40, depth));
  }

  /** Shoaling gain and depth-limited breaking of the swell. */
  swellEnvelope(depth: F, exposure: F): F {
    const kh = depth.mul(this.p.k0);
    const shoal = clamp(float(1).div(max(float(0.05), tanh(kh))).pow(0.25).mul(mix(0.86, 1, smoothstep(12, 45, depth))), 0.86, 1.8);
    const energy = sqrt(exposure);
    const limit = min(float(1), depth.mul(0.36).add(0.065).div(max(float(0.08), this.p.swellGain.mul(0.64).mul(shoal).mul(energy))));
    return shoal.mul(energy).mul(limit);
  }

  /** Whitewater injected by unstable crests over the shelf. */
  breakerPotential(p: V2, crest: F, compression: F): F {
    const c = this.coastField(p);
    const depth = this.coastalDepth(p);
    const g = this.p.swellGain;
    const height = g.mul(1.5).mul(sqrt(c.a));
    const instability = smoothstep(0.48, 0.9, height.div(max(float(0.3), depth)));
    const amplitude = max(float(0.12), g.mul(0.64).mul(this.swellEnvelope(depth, c.a)));
    const crestEvent = smoothstep(0.45, 1.05, crest.div(amplitude));
    const exposure = smoothstep(0.08, 0.65, c.a);
    return instability
      .mul(crestEvent)
      .mul(smoothstep(0.05, 0.5, depth))
      .mul(float(1).sub(smoothstep(9, 18, depth)))
      .mul(exposure)
      .add(compression.mul(0.1).mul(exposure));
  }

  /** Mip level per cascade for a sample footprint in metres. */
  spectralLOD(footprint: F): F[] {
    return this.p.cascades.map((c) => max(float(0), log2(max(float(0.001), footprint.mul(c.size / c.length)))));
  }

  context(p: V2, footprint: F): WaveContext {
    const c = this.coastField(p);
    return { c, depth: this.coastalDepth(p), swellP: this.swellCoordinates(p, c), windP: this.windCoordinates(p), lod: this.spectralLOD(footprint) };
  }

  sampleDisp(i: number, at: V2, lod: F): Node<"vec3"> {
    return this.dispNodes[i].sample(at.div(this.p.cascades[i].length)).level(lod).xyz;
  }

  /** Samples clone the base node and read its current value, so `refresh` reaches them. */
  sampleSlope(i: number, at: V2, lod: F): Node<"vec4"> {
    return this.slopeNodes[i].sample(at.div(this.p.cascades[i].length)).level(lod);
  }

  /** Surface displacement at an undisplaced point, in metres. */
  waveDisplacement(p: V2, footprint: F): Node<"vec3"> {
    const { c, depth, swellP, windP, lod } = this.context(p, footprint);
    const g = this.p.swellGain;
    const swell = this.sampleDisp(0, swellP, lod[0]);
    const along = dot(swell.xz, this.base);
    const steepening = float(1).sub(smoothstep(2, 12, depth)).mul(sqrt(c.a));
    const rms = max(float(0.2), g.mul(0.64));
    const skew = clamp(swell.y.mul(swell.y).sub(along.mul(along)).mul(0.17).sub(swell.y.mul(along).mul(0.19)).div(rms), rms.mul(-0.4), rms.mul(0.5));
    let sy = swell.y.add(skew.mul(steepening));
    let sxz = this.turnSwell(swell.xz, c.yz).mul(mix(1, 1.24, steepening));
    const failure = smoothstep(0.5, 0.95, g.mul(1.5).mul(sqrt(c.a)).div(max(float(0.3), depth)));
    const lip = smoothstep(0.28, 0.88, sy.div(rms)).mul(failure);
    sxz = sxz.add(c.yz.mul(lip).mul(rms).mul(0.28));
    sy = sy.add(lip.mul(rms).mul(0.065));
    const env = this.swellEnvelope(depth, c.a).mul(this.energyRegion(p));
    const swellOut = vec3(sxz.x, sy, sxz.y).mul(env);
    const sea = this.sampleDisp(1, windP, lod[1]);
    const short = this.sampleDisp(2, windP, lod[2]);
    const seaT = this.turnWind(sea.xz);
    const shortT = this.turnWind(short.xz);
    const shoreFade = smoothstep(0.015, 0.8, depth).mul(this.energyRegion(p));
    const wind = vec3(seaT.x, sea.y, seaT.y).mul(mix(0.38, 1, c.a)).add(vec3(shortT.x, short.y, shortT.y).mul(mix(0.68, 1, c.a)));
    return swellOut.add(wind.mul(shoreFade));
  }

  /** Surface slope (dh/dx, dh/dz) at an undisplaced point, filtered to the footprint. */
  waveSlope(p: V2, footprint: F, ctx: WaveContext = this.context(p, footprint)): V2 {
    const { c, depth, swellP, windP, lod } = ctx;
    const g = this.p.swellGain;
    const raw = this.sampleSlope(0, swellP, lod[0]).xy;
    const dis = this.sampleDisp(0, swellP, lod[0]);
    const compression = min(float(3.6), inverseSqrt(max(float(0.05), tanh(depth.mul(this.p.k0)))));
    let swell = raw.add(this.base.mul(dot(raw, this.base)).mul(compression.sub(1)));
    const steepening = float(1).sub(smoothstep(2, 12, depth)).mul(sqrt(c.a));
    const skew = clamp(dis.y.mul(0.35).sub(dot(dis.xz, this.base).mul(0.3)).div(max(float(0.2), g.mul(0.64))), -0.35, 0.8);
    swell = swell.mul(steepening.mul(skew).add(1));
    swell = this.turnSwell(swell, c.yz).mul(this.swellEnvelope(depth, c.a)).mul(this.energyRegion(p));
    const sea = this.sampleSlope(1, windP, lod[1]).xy.mul(mix(0.38, 1, c.a)).add(this.sampleSlope(2, windP, lod[2]).xy.mul(mix(0.68, 1, c.a)));
    return swell.add(this.turnWind(sea).mul(smoothstep(0.015, 0.8, depth)).mul(this.energyRegion(p)));
  }
}
