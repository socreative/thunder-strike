import * as THREE from "three/webgpu";
import type { Node } from "three/webgpu";
import { clamp, cos, cross, dot, exp, float, int, inverseSqrt, ivec2, max, min, pow, screenCoordinate, select, sin, smoothstep, sqrt, texture, uniform, vec2, vec3, vec4 } from "three/tsl";

/*
 * One spectral cascade of the ocean: a JONSWAP spectrum evolved in time and
 * turned into a displacement tile by a GPU FFT, followed by a slope and foam
 * pass. Ported from Techartist's ocean-simulation (MIT), whose GLSL passes
 * are rewritten here as TSL node materials so they run on the WebGPU renderer
 * and its WebGL fallback alike. Every pass is a fullscreen quad into a small
 * half-float render target; the butterfly uses texel loads so no sampler ever
 * blurs an index.
 */

const TAU = Math.PI * 2;

export interface CascadeParams {
  /** Tile length in metres; the field repeats at this period. */
  length: number;
  /** Wavelength band this cascade carries. */
  minWave: number;
  maxWave: number;
  /** Root-mean-square surface elevation the spectrum is normalised to. */
  rms: number;
  /** Mean wave travel direction in radians (x toward z). */
  direction: number;
  /** FFT size, a power of two. */
  size: number;
  /** Peak wavelength of the JONSWAP spectrum in metres. */
  peakWavelength: number;
  /** Amplitude gain applied when packing the displacement. */
  gain: number;
  seed: number;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Half-float RGBA target. Scratch targets are nearest and unmipped; outputs repeat and mip. */
export function fftTarget(n: number, output: boolean): THREE.RenderTarget {
  return new THREE.RenderTarget(n, n, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: output,
    minFilter: output ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter,
    magFilter: output ? THREE.LinearFilter : THREE.NearestFilter,
    wrapS: output ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping,
    wrapT: output ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping,
  });
}

function passMaterial(node: Node): THREE.NodeMaterial {
  const mat = new THREE.NodeMaterial();
  mat.fragmentNode = node;
  mat.depthTest = false;
  mat.depthWrite = false;
  mat.name = "fft-pass";
  return mat;
}

const cmul = (a: Node<"vec2">, b: Node<"vec2">) => vec2(a.x.mul(b.x).sub(a.y.mul(b.y)), a.x.mul(b.y).add(a.y.mul(b.x)));

export class Cascade {
  readonly length: number;
  readonly size: number;
  readonly ping: [THREE.RenderTarget, THREE.RenderTarget];
  readonly displacement: THREE.RenderTarget;
  readonly slopes: [THREE.RenderTarget, THREE.RenderTarget];
  private slopeIndex = 0;
  private primed = false;

  private readonly initial: THREE.DataTexture;
  private readonly evolveMat: THREE.NodeMaterial;
  /* Passes that read a ping-pong target exist once per source: WebGPU forbids
     binding the texture a pass renders into, even when nothing reads it. */
  private readonly transformMats: [THREE.NodeMaterial, THREE.NodeMaterial];
  private readonly packMats: [THREE.NodeMaterial, THREE.NodeMaterial];
  private readonly deriveMats: [THREE.NodeMaterial, THREE.NodeMaterial];
  private readonly clearMat: THREE.NodeMaterial;

  private readonly uTime = uniform(0);
  private readonly uStep = uniform(2, "int");
  private readonly uHorizontal = uniform(1, "int");
  private readonly uDelta = uniform(1 / 60);
  readonly uGain = uniform(1);

  constructor(p: CascadeParams) {
    this.length = p.length;
    this.size = p.size;
    const N = p.size;
    this.ping = [fftTarget(N, false), fftTarget(N, false)];
    this.displacement = fftTarget(N, true);
    this.slopes = [fftTarget(N, true), fftTarget(N, true)];
    this.uGain.value = p.gain;
    this.initial = this.buildSpectrum(p);

    const half = int(N / 2);
    const cell = ivec2(screenCoordinate);
    const readPing = (src: number, c: Node<"ivec2">) => texture(this.ping[src].texture).load(c);
    const both = <T,>(build: (src: number) => T): [T, T] => [build(0), build(1)];

    /* Evolve: rotate the initial spectrum to time t and pack horizontal displacement alongside height. */
    {
      const kxi = select(cell.x.greaterThanEqual(half), cell.x.sub(int(N)), cell.x);
      const kzi = select(cell.y.greaterThanEqual(half), cell.y.sub(int(N)), cell.y);
      const k = vec2(float(kxi), float(kzi)).mul(TAU / p.length);
      const mag = k.length();
      const omega = sqrt(mag.mul(9.81).mul(mag.mul(mag).mul(0.000074).add(1)));
      const phase = omega.mul(this.uTime);
      const rot = vec2(cos(phase), sin(phase));
      const init = texture(this.initial).load(cell);
      const h = cmul(init.xy, vec2(rot.x, rot.y.negate())).add(cmul(vec2(init.z, init.w.negate()), rot));
      const d = k.div(max(mag, 1e-5));
      const packed = vec2(h.y.negate().mul(d.x).sub(h.x.mul(d.y)), h.x.mul(d.x).sub(h.y.mul(d.y)));
      this.evolveMat = passMaterial(select(mag.lessThan(1e-5), vec4(0), vec4(h, packed)));
    }

    /* Transform: one radix-2 Stockham butterfly stage along rows or columns. */
    this.transformMats = both((src) => {
      const horizontal = this.uHorizontal.equal(int(1));
      const index = select(horizontal, cell.x, cell.y);
      const halfStep = this.uStep.div(int(2));
      const remainder = index.sub(index.div(halfStep).mul(halfStep));
      const evenIndex = index.div(this.uStep).mul(halfStep).add(remainder);
      const evenCell = select(horizontal, ivec2(evenIndex, cell.y), ivec2(cell.x, evenIndex));
      const oddCell = evenCell.add(select(horizontal, ivec2(half, int(0)), ivec2(int(0), half)));
      const even = readPing(src, evenCell);
      const odd = readPing(src, oddCell);
      const angle = float(index).mul(TAU).div(float(this.uStep));
      const tw = vec2(cos(angle), sin(angle));
      return passMaterial(even.add(vec4(cmul(tw, odd.xy), cmul(tw, odd.zw))));
    });

    /* Pack: real parts become (x displacement, height, z displacement). */
    this.packMats = both((src) => {
      const field = readPing(src, cell);
      const chop = min(float(2), pow(this.uGain, 0.75)).mul(1.05);
      return passMaterial(vec4(field.b.mul(chop), field.r.mul(this.uGain), field.a.mul(chop), 1));
    });

    /* Derive: slope, Jacobian foam with wind-advected decay, slope variance. */
    this.deriveMats = both((prev) => {
      const uv = screenCoordinate.div(N);
      const texel = 1 / N;
      const disp = (at: Node<"vec2">) => texture(this.displacement.texture, at).level(float(0)).xyz;
      const scale = N / (2 * p.length);
      const dx = disp(uv.add(vec2(texel, 0))).sub(disp(uv.sub(vec2(texel, 0)))).mul(scale);
      const dz = disp(uv.add(vec2(0, texel))).sub(disp(uv.sub(vec2(0, texel)))).mul(scale);
      const nRaw = cross(vec3(dz.x, dz.y, dz.z.add(1)), vec3(dx.x.add(1), dx.y, dx.z));
      const n = nRaw.mul(inverseSqrt(max(dot(nRaw, nRaw), 1e-12)));
      const slope = clamp(n.xz.negate().div(max(float(0.25), n.y)), vec2(-4), vec2(4));
      const jacobian = dx.x.add(1).mul(dz.z.add(1)).sub(dx.z.mul(dz.x));
      const prevUV = uv.sub(vec2(1.9, 0.8).mul(this.uDelta).div(p.length));
      const previous = texture(this.slopes[prev].texture, prevUV).level(float(0)).b;
      const breaking = smoothstep(0.22, 0.48, float(1).sub(jacobian));
      const foam = max(previous.mul(exp(this.uDelta.mul(-0.62))), breaking);
      return passMaterial(vec4(slope, foam, dot(slope, slope)));
    });

    this.clearMat = passMaterial(vec4(0));
  }

  /** The slope target written by the latest derive pass. */
  get slopeTexture(): THREE.Texture {
    return this.slopes[this.slopeIndex].texture;
  }

  /** JONSWAP amplitudes with Gaussian phases, packed as h0(k) and conj(h0(-k)). */
  private buildSpectrum(p: CascadeParams): THREE.DataTexture {
    const N = p.size;
    let seed = (p.seed | 0) + 192731;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(1e-8, random()))) * Math.cos(TAU * random());
    const coefficients = new Float32Array(N * N * 2);
    const initial = new Float32Array(N * N * 4);
    const deltaK = TAU / p.length;
    const peakOmega = Math.sqrt((9.81 * TAU) / p.peakWavelength);
    let energy = 0;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const kx = (x < N / 2 ? x : x - N) * deltaK;
        const kz = (z < N / 2 ? z : z - N) * deltaK;
        const k = Math.hypot(kx, kz);
        const index = (z * N + x) * 2;
        if (k < 0.00001) continue;
        const wavelength = TAU / k;
        const band = smooth(p.minWave, p.minWave * 1.35, wavelength) * (1 - smooth(p.maxWave * 0.75, p.maxWave, wavelength));
        if (band === 0) continue;
        const omega = Math.sqrt(9.81 * k);
        const sigma = omega <= peakOmega ? 0.07 : 0.09;
        const peak = Math.exp(-0.5 * ((omega - peakOmega) / (sigma * peakOmega)) ** 2);
        const jonswap = ((0.0081 * 9.81 ** 2) / omega ** 5) * Math.exp(-1.25 * (peakOmega / omega) ** 4) * 3.3 ** peak;
        const alignment = (kx * Math.cos(p.direction) + kz * Math.sin(p.direction)) / k;
        const spreading = 0.97 * Math.max(alignment, 0) ** (p.length > 600 ? 14 : 3) + 0.015;
        const density = ((jonswap * 0.5 * Math.sqrt(9.81 / k)) / k) * spreading * deltaK ** 2 * band;
        const amplitude = Math.sqrt(density * 0.5);
        coefficients[index] = gaussian() * amplitude;
        coefficients[index + 1] = gaussian() * amplitude;
        energy += coefficients[index] ** 2 + coefficients[index + 1] ** 2;
      }
    }
    const scale = p.rms / Math.sqrt(Math.max(1e-15, energy * 2));
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = (z * N + x) * 4;
        const k = i / 2;
        const opposite = (((N - z) % N) * N + ((N - x) % N)) * 2;
        initial[i] = coefficients[k] * scale;
        initial[i + 1] = coefficients[k + 1] * scale;
        initial[i + 2] = coefficients[opposite] * scale;
        initial[i + 3] = coefficients[opposite + 1] * scale;
      }
    }
    const tex = new THREE.DataTexture(initial, N, N, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  /** Run every pass for this cascade. `time` is the sea's own clock in seconds. */
  update(renderer: THREE.WebGPURenderer, quad: THREE.QuadMesh, dt: number, time: number): void {
    if (!this.primed) {
      quad.material = this.clearMat;
      for (const t of this.slopes) {
        renderer.setRenderTarget(t);
        quad.render(renderer);
      }
      this.primed = true;
    }
    this.uTime.value = time;
    quad.material = this.evolveMat;
    renderer.setRenderTarget(this.ping[0]);
    quad.render(renderer);
    let index = 0;
    for (let axis = 0; axis < 2; axis++) {
      this.uHorizontal.value = axis === 0 ? 1 : 0;
      for (let step = 2; step <= this.size; step *= 2) {
        this.uStep.value = step;
        quad.material = this.transformMats[index];
        index = 1 - index;
        renderer.setRenderTarget(this.ping[index]);
        quad.render(renderer);
      }
    }
    quad.material = this.packMats[index];
    renderer.setRenderTarget(this.displacement);
    quad.render(renderer);
    this.uDelta.value = dt;
    quad.material = this.deriveMats[this.slopeIndex];
    this.slopeIndex = 1 - this.slopeIndex;
    renderer.setRenderTarget(this.slopes[this.slopeIndex]);
    quad.render(renderer);
  }

  dispose(): void {
    for (const t of [...this.ping, this.displacement, ...this.slopes]) t.dispose();
    this.initial.dispose();
    for (const m of [this.evolveMat, ...this.transformMats, ...this.packMats, ...this.deriveMats, this.clearMat]) m.dispose();
  }
}
