import * as THREE from "three/webgpu";
import { cameraPosition, clamp, color, dFdx, dFdy, dot, float, length, max, mix, normalize, positionLocal, positionWorld, pow, saturate, sin, smoothstep, sqrt, step, texture, transformNormalToView, uniform, varying, vec2, vec3 } from "three/tsl";
import type { WaterPalette } from "./Theme";
import { Cascade } from "./water/Cascade";
import type { CoastalField } from "./water/Coastal";
import { FoamField, fractalNoise, noise2 } from "./water/Foam";
import { WaveField } from "./water/WaveField";

/** Vertex grid spacing in metres. Finer waves live in the slope textures. */
const GRID_CELL = 3;

export interface WaterOptions {
  /** Side of the square map in metres. */
  mapSize: number;
  pal: WaterPalette;
  /** Seabed height in metres in the red channel. */
  heights: THREE.Texture;
  coast: CoastalField;
  skyColor: number;
  seed: number;
}

/**
 * The sea: a JONSWAP spectrum in three FFT cascades, refracted along the
 * coastal travel-time field, shoaling and breaking over the shelf, with
 * Jacobian whitecaps offshore and an advected surf-foam history near the
 * beach. The wave model is ported from Techartist's ocean-simulation (MIT);
 * the shading keeps this game's palette-driven depth colours, the sand
 * showing through the last metres and a sky tint at grazing angles, and
 * skips that demo's reflections, refraction and caustics.
 */
export class WaterSystem {
  readonly mesh: THREE.Mesh;
  readonly cascades: Cascade[];
  readonly wave: WaveField;
  readonly foam: FoamField;
  private readonly quad = new THREE.QuadMesh();
  private readonly foamNode: ReturnType<typeof texture>;
  private time = 0;
  private frame = 0;
  private readonly uTime = uniform(0);
  private readonly uWind = uniform(new THREE.Vector2(1, 0));
  private readonly uSwellGain = uniform(1);
  private readonly uSurfaceWind = uniform(1.15);
  /** Milliseconds spent in the last simulate call, for profiling. */
  lastSimMs = 0;

  constructor(o: WaterOptions) {
    const pal = o.pal;
    const swellDir = unit(pal.swellDir ?? [1, 0]);
    const windDir = unit(pal.windDir ?? swellDir);
    const peak = pal.peakWavelength ?? 48;
    const gains = pal.gains ?? [1.45, 1.25, 1.1];
    const swellMul = pal.swell ?? 1;
    this.uWind.value.set(windDir[0], windDir[1]);
    this.uSwellGain.value = gains[0] * swellMul;
    this.uSurfaceWind.value = pal.surfaceWind ?? 1.15;

    // Swell tile long enough never to repeat across the map; wind sea and
    // capillary tiles as in the source, the spectrum sized to the peak.
    this.cascades = [
      new Cascade({ length: 1024, minWave: 20, maxWave: 500, rms: (0.49 * peak) / 78, direction: Math.atan2(swellDir[1], swellDir[0]), size: 128, peakWavelength: peak, gain: gains[0] * swellMul, seed: o.seed }),
      new Cascade({ length: 211, minWave: 2.5, maxWave: 30, rms: 0.16, direction: 0, size: 256, peakWavelength: peak, gain: gains[1], seed: o.seed + 1 }),
      new Cascade({ length: 27.3, minWave: 0.25, maxWave: 3.8, rms: 0.017, direction: 0.3, size: 128, peakWavelength: peak, gain: gains[2], seed: o.seed + 2 }),
    ];
    this.wave = new WaveField({
      cascades: this.cascades,
      heights: o.heights,
      coast: o.coast.texture,
      mapSize: o.mapSize,
      swellDir,
      k0: (2 * Math.PI) / peak,
      windDir: this.uWind,
      swellGain: this.uSwellGain,
      surfaceWind: this.uSurfaceWind,
      time: this.uTime,
    });
    this.foam = new FoamField(this.wave, o.heights, o.mapSize, this.uTime);
    this.foamNode = texture(this.foam.texture);

    const span = o.mapSize * 1.6;
    const segments = Math.round(span / GRID_CELL);
    const geo = new THREE.PlaneGeometry(span, span, segments, segments);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.buildMaterial(o, swellDir));
    this.mesh.position.y = 0;
    this.mesh.name = "water";
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }

  private buildMaterial(o: WaterOptions, swellDir: [number, number]): THREE.MeshStandardNodeMaterial {
    const pal = o.pal;
    const wave = this.wave;
    const t = this.uTime;
    const mat = new THREE.MeshStandardNodeMaterial();

    /* Vertex stage: displace the grid, carry the undisplaced point and the swell height across. */
    const lxz = positionLocal.xz;
    const disp = wave.waveDisplacement(lxz, float(GRID_CELL * 1.3));
    const tide = sin(t.mul(0.29)).mul(0.07).add(sin(t.mul(0.47).add(1.7)).mul(0.035));
    mat.positionNode = positionLocal.add(vec3(disp.x, disp.y.add(tide), disp.z));
    const p = varying(lxz);
    const vHeight = varying(disp.y);

    /* Fragment stage. */
    const footprint = max(length(dFdx(p)), length(dFdy(p)));
    const ctx = wave.context(p, footprint);
    const { c, depth } = ctx;
    const slope = wave.waveSlope(p, footprint, ctx);
    const nWorld = normalize(vec3(slope.x.negate(), 1, slope.y.negate()));
    mat.normalNode = transformNormalToView(nWorld);

    const w0 = wave.sampleSlope(0, ctx.swellP, ctx.lod[0]);
    const w1 = wave.sampleSlope(1, ctx.windP, ctx.lod[1]);
    const w2 = wave.sampleSlope(2, ctx.windP, ctx.lod[2]);
    const env = wave.swellEnvelope(depth, c.a);
    const variance = max(float(0), w0.a.sub(dot(w0.xy, w0.xy)))
      .mul(env)
      .add(max(float(0), w1.a.sub(dot(w1.xy, w1.xy))).mul(pow(mix(0.38, 1, c.a), 2)))
      .add(max(float(0), w2.a.sub(dot(w2.xy, w2.xy))).mul(pow(mix(0.68, 1, c.a), 2)));
    // Unresolved slope energy widens the highlight instead of aliasing into sparkle.
    const alpha = clamp(sqrt(variance.mul(0.32).add(0.02 * 0.02)), 0.009, 0.26);

    /* Surf and whitecaps. */
    const historyUV = p.div(o.mapSize).add(0.5);
    const inside = step(max(historyUV.x.sub(0.5).abs(), historyUV.y.sub(0.5).abs()), 0.498);
    const historyRaw = this.foamNode.sample(clamp(historyUV, 0.001, 0.999)).mul(inside);
    const support = wave.coastalFoamSupport(depth);
    const history = { r: historyRaw.r.mul(support), g: historyRaw.g.mul(support) };
    const crest = wave.sampleDisp(0, ctx.swellP, ctx.lod[0]).y;
    const steepness = length(slope);
    const compression = smoothstep(0.32, 0.7, steepness).mul(smoothstep(0.08, 0.5, crest));
    const transformedCrest = crest.mul(env).mul(wave.energyRegion(p));
    const breaker = clamp(wave.breakerPotential(p, transformedCrest, compression), 0, 1);
    const drift = this.uWind.mul(t).mul(this.uSurfaceWind.mul(0.11).add(0.15));
    const foamP = p.sub(drift).sub(c.yz.mul(t).mul(0.22));
    const streakP = wave.windCoordinates(foamP);
    const streak = noise2(vec2(streakP.x.mul(0.12), streakP.y.mul(1.3)).add(vec2(0, sin(streakP.x.mul(0.023)).mul(0.8))));
    const cells = fractalNoise(foamP.mul(1.9).add(vec2(sin(t.mul(0.23)), sin(t.mul(0.19).add(1.57))).mul(0.22)));
    const laceDetail = mix(smoothstep(0.33, 0.7, cells), float(0.53), smoothstep(0.08, 0.45, footprint));
    const ageLace = mix(laceDetail, float(1), history.g.mul(0.7));
    const coastalFoam = smoothstep(0.09, 0.82, history.r).mul(mix(0.12, 0.82, ageLace)).mul(history.g.mul(0.2).add(1));
    const shoreMul = pal.shore ?? 1;
    const spectralFoam = clamp(w0.b.mul(0.12).add(w1.b.mul(0.8)), 0, 1)
      .mul(c.a)
      .mul(smoothstep(0.58, 0.84, streak))
      .mul(mix(0.025, 0.4, smoothstep(0.45, 3.4, this.uSurfaceWind)))
      .mul(smoothstep(4, 14, depth));
    const lip = breaker.mul(mix(0.45, 1, laceDetail));
    const foamK = clamp(coastalFoam.mul(shoreMul).add(spectralFoam.mul(pal.foamAmount * 2.2)).add(lip.mul(0.26 * shoreMul)), 0, 0.94);

    /* Colour: depth palette, sand through the shallows, crests a touch lighter, foam, sky at grazing angles. */
    const deep = color(pal.deep);
    const shallow = color(pal.shallow);
    const shoal = float(1).sub(smoothstep(1.2, 16, depth));
    let col = mix(deep, shallow, shoal);
    const rms = Math.max(0.2, this.uSwellGain.value * 0.64);
    const relief = clamp(vHeight.div(rms), -1, 1);
    col = col.mul(relief.mul(0.12).add(1));
    const bottom = float(1).sub(smoothstep(0.15, 2.8, depth));
    col = mix(col, color(pal.bed ?? 0xc2ae86), bottom.mul(0.6));
    col = mix(col, color(pal.foam), foamK);
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const schlick = pow(saturate(float(1).sub(dot(nWorld, viewDir))), 3);
    col = mix(col, color(o.skyColor), saturate(schlick.mul(0.6)));
    mat.colorNode = col;
    // Thin crests let a little light through from behind.
    mat.emissiveNode = shallow.mul(smoothstep(0.35, 1, relief).mul(smoothstep(0.12, 1.4, depth)).mul(0.08));
    mat.roughnessNode = mix(clamp(sqrt(alpha), 0.08, 0.6), float(0.8), foamK);
    mat.metalnessNode = float(0.02);
    void swellDir;
    return mat;
  }

  /** Run the spectrum, FFT and foam passes for this frame. Call before rendering the scene. */
  simulate(renderer: THREE.WebGPURenderer, dt: number): void {
    const t0 = performance.now();
    this.time += dt;
    this.frame++;
    this.uTime.value = this.time;
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    this.cascades.forEach((c, i) => {
      // The long swell changes slowly; it runs on alternate frames with a double step.
      if (i === 0 && this.frame % 2 !== 0) return;
      c.update(renderer, this.quad, i === 0 ? dt * 2 : dt, this.time);
    });
    this.wave.refresh();
    if (this.foam.update(renderer, this.quad, dt)) this.foamNode.value = this.foam.texture;
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
    this.lastSimMs = performance.now() - t0;
  }

  dispose(): void {
    for (const c of this.cascades) c.dispose();
    this.foam.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.geometry.dispose();
  }
}

function unit(v: [number, number]): [number, number] {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}
