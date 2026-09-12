import * as THREE from "three/webgpu";
import { float, instancedBufferAttribute, smoothstep, uv, vec2, vec4 } from "three/tsl";

export interface ParticleOpts {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  sizeEnd?: number;
  color: number;
  colorEnd?: number;
  alpha?: number;
  gravity?: number;
  drag?: number;
}

const tmpColor = new THREE.Color();

/**
 * One instanced Sprite per blend mode. Simulation runs on the CPU and is
 * copied into instanced attributes each frame, so it behaves identically on
 * the WebGPU and WebGL backends.
 */
class Layer {
  readonly sprite: THREE.Sprite;
  private readonly max: number;
  private readonly posAttr: THREE.InstancedBufferAttribute;
  private readonly scaleAttr: THREE.InstancedBufferAttribute;
  private readonly colorAttr: THREE.InstancedBufferAttribute;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly col0: Float32Array;
  private readonly col1: Float32Array;
  private readonly alpha: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  /** Live particles are kept packed in [0, n), oldest first. */
  private n = 0;
  get aliveCount(): number {
    return this.n;
  }

  constructor(max: number, additive: boolean, renderOrder: number) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.col0 = new Float32Array(max * 3);
    this.col1 = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);

    this.posAttr = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.scaleAttr = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.scaleAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);

    const mat = new THREE.SpriteNodeMaterial();
    mat.positionNode = instancedBufferAttribute<"vec3">(this.posAttr, "vec3");
    const s = instancedBufferAttribute<"float">(this.scaleAttr, "float");
    mat.scaleNode = vec2(s, s);
    const c = instancedBufferAttribute<"vec4">(this.colorAttr, "vec4");
    // Soft round falloff so no texture is needed.
    const d = uv().sub(0.5).length().mul(2);
    const soft = smoothstep(0.25, 1.0, d).oneMinus();
    mat.colorNode = vec4(c.xyz, c.w.mul(soft));
    mat.opacityNode = float(1);
    mat.transparent = true;
    mat.depthWrite = false;
    mat.depthTest = true;
    mat.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    mat.fog = !additive;

    this.sprite = new THREE.Sprite(mat);
    this.sprite.count = 0;
    this.sprite.frustumCulled = false;
    this.sprite.renderOrder = renderOrder;
    this.sprite.name = additive ? "particles-additive" : "particles-normal";
  }

  spawn(o: ParticleOpts): void {
    // Append to the live run; when the pool is full the oldest particle, which
    // is at the front, gives up its slot.
    let i: number;
    if (this.n < this.max) {
      i = this.n;
      this.n++;
    } else {
      i = 0;
    }
    this.pos[i * 3] = o.x;
    this.pos[i * 3 + 1] = o.y;
    this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx ?? 0;
    this.vel[i * 3 + 1] = o.vy ?? 0;
    this.vel[i * 3 + 2] = o.vz ?? 0;
    this.life[i] = o.life;
    this.maxLife[i] = o.life;
    this.size0[i] = o.size;
    this.size1[i] = o.sizeEnd ?? o.size;
    tmpColor.setHex(o.color);
    this.col0[i * 3] = tmpColor.r;
    this.col0[i * 3 + 1] = tmpColor.g;
    this.col0[i * 3 + 2] = tmpColor.b;
    tmpColor.setHex(o.colorEnd ?? o.color);
    this.col1[i * 3] = tmpColor.r;
    this.col1[i * 3 + 1] = tmpColor.g;
    this.col1[i * 3 + 2] = tmpColor.b;
    this.alpha[i] = o.alpha ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
  }

  update(dt: number): void {
    const pa = this.posAttr.array as Float32Array;
    const sa = this.scaleAttr.array as Float32Array;
    const ca = this.colorAttr.array as Float32Array;
    // Walk the live run, dropping the dead and closing the gaps behind them.
    // Compacting in place keeps the draw count equal to the number of live
    // particles, and keeping it stable preserves the order transparent sprites
    // blend in.
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const l = this.life[i] - dt;
      if (l <= 0) continue;
      if (w !== i) this.move(w, i);
      this.life[w] = l;
      const k = 1 - l / this.maxLife[w]; // 0 at birth, 1 at death
      const dr = 1 - this.drag[w] * dt;
      this.vel[w * 3] *= dr;
      this.vel[w * 3 + 1] = this.vel[w * 3 + 1] * dr - this.grav[w] * dt;
      this.vel[w * 3 + 2] *= dr;
      this.pos[w * 3] += this.vel[w * 3] * dt;
      this.pos[w * 3 + 1] += this.vel[w * 3 + 1] * dt;
      this.pos[w * 3 + 2] += this.vel[w * 3 + 2] * dt;
      pa[w * 3] = this.pos[w * 3];
      pa[w * 3 + 1] = this.pos[w * 3 + 1];
      pa[w * 3 + 2] = this.pos[w * 3 + 2];
      sa[w] = this.size0[w] + (this.size1[w] - this.size0[w]) * k;
      ca[w * 4] = this.col0[w * 3] + (this.col1[w * 3] - this.col0[w * 3]) * k;
      ca[w * 4 + 1] = this.col0[w * 3 + 1] + (this.col1[w * 3 + 1] - this.col0[w * 3 + 1]) * k;
      ca[w * 4 + 2] = this.col0[w * 3 + 2] + (this.col1[w * 3 + 2] - this.col0[w * 3 + 2]) * k;
      // Quick fade in, long fade out.
      const fade = Math.min(1, k * 6) * (1 - k * k);
      ca[w * 4 + 3] = this.alpha[w] * fade;
      w++;
    }
    this.n = w;
    this.sprite.count = w;
    if (w === 0) return;
    // Upload only the live run rather than the whole pool.
    this.posAttr.clearUpdateRanges();
    this.scaleAttr.clearUpdateRanges();
    this.colorAttr.clearUpdateRanges();
    this.posAttr.addUpdateRange(0, w * 3);
    this.scaleAttr.addUpdateRange(0, w);
    this.colorAttr.addUpdateRange(0, w * 4);
    this.posAttr.needsUpdate = true;
    this.scaleAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  /** Copy every field of one particle over another. */
  private move(dst: number, src: number): void {
    for (let c = 0; c < 3; c++) {
      this.pos[dst * 3 + c] = this.pos[src * 3 + c];
      this.vel[dst * 3 + c] = this.vel[src * 3 + c];
      this.col0[dst * 3 + c] = this.col0[src * 3 + c];
      this.col1[dst * 3 + c] = this.col1[src * 3 + c];
    }
    this.life[dst] = this.life[src];
    this.maxLife[dst] = this.maxLife[src];
    this.size0[dst] = this.size0[src];
    this.size1[dst] = this.size1[src];
    this.alpha[dst] = this.alpha[src];
    this.grav[dst] = this.grav[src];
    this.drag[dst] = this.drag[src];
  }

  clear(): void {
    this.life.fill(0);
    this.n = 0;
    this.sprite.count = 0;
  }

  dispose(): void {
    // Sprite geometry is shared by every Sprite in three.js; only the material is ours.
    (this.sprite.material as THREE.Material).dispose();
  }
}

/** Blend two hex colours; `t` toward the second. */
function mixHex(a: number, b: number, t: number): number {
  return tmpColor.setHex(a).lerp(tmpMix.setHex(b), Math.min(1, Math.max(0, t))).getHex();
}
const tmpMix = new THREE.Color();

const LEAF_COLORS = [0x5f8a3a, 0x8aa04a, 0x7a5a30, 0xa8b05a, 0x4d7330, 0x9c7a44];

export class Particles {
  readonly smoke: Layer;
  readonly fire: Layer;
  /** Rotor downwash lives in its own pool so it cannot crowd out explosions. */
  readonly dust: Layer;
  readonly group = new THREE.Group();

  /** Ground colour kicked up by rounds and rotor wash; set per map theme. */
  private dustStart = 0xe8d3a8;
  private dustEnd = 0xd2b98c;
  private hitStart = 0xd8bc86;
  private hitEnd = 0xcbb283;

  setDustColors(start: number, end: number): void {
    this.dustStart = start;
    this.dustEnd = end;
    // Impact puffs are a touch lighter than the settling wash.
    this.hitStart = new THREE.Color(start).lerp(new THREE.Color(0xffffff), 0.08).getHex();
    this.hitEnd = end;
  }

  constructor(smokeMax = 4500, fireMax = 2500, dustMax = 1800) {
    this.smoke = new Layer(smokeMax, false, 10);
    this.dust = new Layer(dustMax, false, 9);
    this.fire = new Layer(fireMax, true, 11);
    this.group.add(this.dust.sprite, this.smoke.sprite, this.fire.sprite);
  }

  update(dt: number): void {
    this.updateFragments(dt);
    this.smoke.update(dt);
    this.dust.update(dt);
    this.fire.update(dt);
  }

  clear(): void {
    this.fragments.length = 0;
    this.smoke.clear();
    this.dust.clear();
    this.fire.clear();
  }

  dispose(): void {
    this.smoke.dispose();
    this.dust.dispose();
    this.fire.dispose();
  }

  /* Effect recipes */

  /** Ground height under a point; set by the world so fragments can bounce and airbursts can be told apart. */
  groundAt: (x: number, z: number) => number = () => 0;

  /**
   * Blast in layers. On the ground: a flash, a shockwave ring of dust, a
   * boiling fireball, a buoyant column of dark smoke, embers, and solid
   * fragments on ballistic arcs. In the air: a brighter, rounder burst, a
   * pressure shell of grey smoke expanding in every direction, debris raining
   * down on trails, and a lingering puff that drifts instead of rising.
   * Counts scale with `size`, about 1.4 for a rocket to 4.6 for a silo.
   */
  explosion(p: THREE.Vector3, size: number, airborne = false): void {
    const s = size;
    if (airborne) {
      this.airburst(p, s);
      return;
    }
    // Flash: a hot white core that swells and dies within a few frames.
    this.fire.spawn({ x: p.x, y: p.y + s * 0.4, z: p.z, life: 0.14, size: s * 5, sizeEnd: s * 9, color: 0xfff6dc, alpha: 1 });
    this.fire.spawn({ x: p.x, y: p.y + s * 0.6, z: p.z, life: 0.3, size: s * 3, sizeEnd: s * 6, color: 0xffc070, colorEnd: 0xff5a20, alpha: 0.7 });

    // Fireball: many small tongues, dense at the core, boiling upward and out.
    const fireN = Math.round(16 + s * 12);
    for (let i = 0; i < fireN; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = Math.random() * Math.PI * 0.5;
      const sp = (3 + Math.random() * 7) * s * 0.7;
      const hot = Math.random();
      this.fire.spawn({
        x: p.x + Math.cos(a) * Math.random() * s * 0.5,
        y: p.y + Math.random() * s * 0.6,
        z: p.z + Math.sin(a) * Math.random() * s * 0.5,
        vx: Math.cos(a) * Math.cos(el) * sp,
        vy: Math.sin(el) * sp + 3 + Math.random() * 4 * s * 0.5,
        vz: Math.sin(a) * Math.cos(el) * sp,
        life: 0.35 + Math.random() * 0.55,
        size: s * (0.6 + Math.random() * 0.9),
        sizeEnd: s * (1.2 + Math.random() * 0.8),
        color: hot > 0.6 ? 0xfff0c0 : 0xffb050,
        colorEnd: hot > 0.6 ? 0xff7020 : 0x7a1a08,
        alpha: 0.95,
        drag: 2.6,
        gravity: -6,
      });
    }

    // Shockwave: a ring of ground dust racing outward and settling.
    const ringN = Math.round(14 + s * 10);
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * Math.PI * 2 + Math.random() * 0.3;
      const sp = (10 + Math.random() * 8) * (0.8 + s * 0.25);
      this.dust.spawn({
        x: p.x + Math.cos(a) * s * 0.8,
        y: p.y + 0.3 + Math.random() * 0.6,
        z: p.z + Math.sin(a) * s * 0.8,
        vx: Math.cos(a) * sp,
        vy: 1.5 + Math.random() * 2,
        vz: Math.sin(a) * sp,
        life: 0.9 + Math.random() * 0.7,
        size: s * 0.6,
        sizeEnd: s * (2.6 + Math.random()),
        color: this.dustStart,
        colorEnd: this.dustEnd,
        alpha: 0.5,
        drag: 3.2,
        gravity: 2,
      });
    }

    // Smoke column: dark, buoyant, long-lived, thinning to grey as it rises.
    const smokeN = Math.round(10 + s * 7);
    for (let i = 0; i < smokeN; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * s * 0.9;
      const late = Math.random();
      this.smoke.spawn({
        x: p.x + Math.cos(a) * r,
        y: p.y + Math.random() * s * 0.8,
        z: p.z + Math.sin(a) * r,
        vx: Math.cos(a) * r * 1.5 + (Math.random() - 0.5) * 2,
        vy: 3 + Math.random() * 4 + late * 3,
        vz: Math.sin(a) * r * 1.5 + (Math.random() - 0.5) * 2,
        life: 2.4 + Math.random() * 2.6 + s * 0.5,
        size: s * (0.9 + Math.random() * 0.6),
        sizeEnd: s * (3.4 + Math.random() * 1.6),
        color: late > 0.5 ? 0x2a2622 : 0x3d3630,
        colorEnd: 0x7d7975,
        alpha: 0.7,
        drag: 1.4,
        gravity: -2.2,
      });
    }

    this.embers(p, s, false);
    this.throwFragments(p, s, false);
  }

  /** Mid-air detonation: a missile shot down, or the aircraft itself. */
  private airburst(p: THREE.Vector3, s: number): void {
    this.fire.spawn({ x: p.x, y: p.y, z: p.z, life: 0.12, size: s * 6, sizeEnd: s * 11, color: 0xfffaf0, alpha: 1 });
    this.fire.spawn({ x: p.x, y: p.y, z: p.z, life: 0.28, size: s * 3.5, sizeEnd: s * 7, color: 0xffd090, colorEnd: 0xff6a20, alpha: 0.75 });
    // Round fireball: tongues in every direction, faster and shorter than a ground blast.
    const fireN = Math.round(18 + s * 12);
    for (let i = 0; i < fireN; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = Math.asin(Math.random() * 2 - 1);
      const sp = (6 + Math.random() * 10) * s * 0.7;
      this.fire.spawn({
        x: p.x,
        y: p.y,
        z: p.z,
        vx: Math.cos(a) * Math.cos(el) * sp,
        vy: Math.sin(el) * sp,
        vz: Math.sin(a) * Math.cos(el) * sp,
        life: 0.25 + Math.random() * 0.4,
        size: s * (0.5 + Math.random() * 0.8),
        sizeEnd: s * (1.0 + Math.random() * 0.6),
        color: 0xfff0c0,
        colorEnd: 0xff5a18,
        alpha: 0.95,
        drag: 3.5,
      });
    }
    // Pressure shell: a sphere of grey smoke thrown out fast and gone within a second or two.
    const shellN = Math.round(20 + s * 10);
    for (let i = 0; i < shellN; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = Math.asin(Math.random() * 2 - 1);
      const sp = (14 + Math.random() * 10) * (0.7 + s * 0.2);
      this.smoke.spawn({
        x: p.x,
        y: p.y,
        z: p.z,
        vx: Math.cos(a) * Math.cos(el) * sp,
        vy: Math.sin(el) * sp,
        vz: Math.sin(a) * Math.cos(el) * sp,
        life: 0.9 + Math.random() * 0.8,
        size: s * 0.7,
        sizeEnd: s * (2.4 + Math.random()),
        color: 0x8a8580,
        colorEnd: 0xb9b5b0,
        alpha: 0.5,
        drag: 4,
        gravity: 1.5,
      });
    }
    // The cloud that stays: a few dark puffs that hang, drift and sink slightly rather than rise.
    const hangN = Math.round(4 + s * 2);
    for (let i = 0; i < hangN; i++) {
      this.smoke.spawn({
        x: p.x + (Math.random() - 0.5) * s,
        y: p.y + (Math.random() - 0.5) * s,
        z: p.z + (Math.random() - 0.5) * s,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 1,
        vz: (Math.random() - 0.5) * 2,
        life: 3 + Math.random() * 2.5,
        size: s * 1.2,
        sizeEnd: s * (3.5 + Math.random()),
        color: 0x3a3532,
        colorEnd: 0x8a8683,
        alpha: 0.6,
        drag: 1.2,
        gravity: 0.6,
      });
    }
    this.embers(p, s, true);
    this.throwFragments(p, s, true);
  }

  /** Glowing specks: thrown up from a ground blast, in every direction from an airburst. */
  private embers(p: THREE.Vector3, s: number, sphere: boolean): void {
    const n = Math.round(10 + s * 8);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = sphere ? Math.asin(Math.random() * 2 - 1) : 0.3 + Math.random() * 1.1;
      const sp = 6 + Math.random() * 16 * s * 0.6;
      this.fire.spawn({
        x: p.x,
        y: p.y + (sphere ? 0 : 0.5),
        z: p.z,
        vx: Math.cos(a) * Math.cos(el) * sp,
        vy: Math.sin(el) * sp + (sphere ? 0 : 4),
        vz: Math.sin(a) * Math.cos(el) * sp,
        life: 0.7 + Math.random() * 0.9,
        size: 0.45,
        sizeEnd: 0.12,
        color: 0xffd080,
        colorEnd: 0xff4010,
        gravity: 24,
        drag: 0.5,
      });
    }
  }

  /**
   * Debris. No two blasts throw the same pattern: a random number of pieces,
   * one to three "jets" that most of them cluster around, the rest anywhere,
   * speeds spread over a wide range so some tumble a few metres and others sail
   * off, and only some of them burn enough to trail smoke.
   */
  private throwFragments(p: THREE.Vector3, s: number, sphere: boolean): void {
    const n = Math.min(Math.round((3 + s * 2) * (0.6 + Math.random() * 1.1)), 44);
    const jets: [number, number][] = [];
    const jetN = 1 + Math.floor(Math.random() * 3);
    for (let j = 0; j < jetN; j++) jets.push([Math.random() * Math.PI * 2, sphere ? Math.asin(Math.random() * 2 - 1) : 0.4 + Math.random() * 1.0]);
    for (let i = 0; i < n; i++) {
      let a: number;
      let el: number;
      if (Math.random() < 0.6) {
        const [ja, je] = jets[Math.floor(Math.random() * jetN)];
        a = ja + (Math.random() - 0.5) * 0.8;
        el = je + (Math.random() - 0.5) * 0.6;
      } else {
        a = Math.random() * Math.PI * 2;
        el = sphere ? Math.asin(Math.random() * 2 - 1) : 0.15 + Math.random() * 1.3;
      }
      // Log-uniform speeds: plenty of slow tumblers, a few that really fly.
      const sp = Math.exp(Math.log(5) + Math.random() * Math.log(7)) * (0.7 + s * 0.2);
      this.fragments.push({
        x: p.x,
        y: p.y + (sphere ? 0 : 0.6),
        z: p.z,
        vx: Math.cos(a) * Math.cos(el) * sp,
        vy: Math.sin(el) * sp,
        vz: Math.sin(a) * Math.cos(el) * sp,
        life: 1.4 + Math.random() * 2.2,
        size: 0.2 + Math.random() * 0.6 * (0.6 + s * 0.2),
        trail: 0,
        smokes: Math.random() < 0.7,
        bounces: 0,
      });
    }
  }

  /** Debris fragments in flight. Simulated here so each can leave a smoke trail. */
  private fragments: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; size: number; trail: number; smokes: boolean; bounces: number }[] = [];

  private updateFragments(dt: number): void {
    const list = this.fragments;
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      f.life -= dt;
      if (f.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      f.vy -= 22 * dt;
      const drag = Math.max(0, 1 - 0.35 * dt);
      f.vx *= drag;
      f.vz *= drag;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      // Hitting the ground: bounce once or twice, skid, and stop burning.
      const ground = this.groundAt(f.x, f.z) + f.size * 0.5;
      if (f.y < ground) {
        f.y = ground;
        if (f.vy < -2 && f.bounces < 2) {
          f.vy = -f.vy * (0.25 + Math.random() * 0.2);
          f.vx *= 0.6;
          f.vz *= 0.6;
          f.bounces++;
          this.dust.spawn({ x: f.x, y: f.y, z: f.z, life: 0.5, size: f.size * 2, sizeEnd: f.size * 5, color: this.dustStart, colorEnd: this.dustEnd, alpha: 0.45 });
        } else {
          f.vy = 0;
          f.vx *= 0.85;
          f.vz *= 0.85;
        }
        f.smokes = false;
      }
      // The fragment itself: a dark speck redrawn each frame.
      this.dust.spawn({ x: f.x, y: f.y, z: f.z, life: 0.08, size: f.size, sizeEnd: f.size, color: 0x1e1c1a, alpha: 0.95 });
      // Its smoke trail, thin and short-lived so it reads as a streak.
      f.trail -= dt;
      if (f.smokes && f.trail <= 0) {
        // Dense enough that consecutive puffs overlap at the fragment's speed.
        f.trail = 0.014;
        this.smoke.spawn({
          x: f.x,
          y: f.y,
          z: f.z,
          vx: (Math.random() - 0.5) * 0.6,
          vy: 0.6,
          vz: (Math.random() - 0.5) * 0.6,
          life: 0.8 + Math.random() * 0.5,
          size: f.size * 2.2,
          sizeEnd: f.size * 4,
          color: 0x5a5652,
          colorEnd: 0x8c8884,
          alpha: 0.55,
          drag: 2,
        });
      }
    }
  }

  /** Small impact sparkle for bullets hitting a target. */
  spark(p: THREE.Vector3, color = 0xffd27a): void {
    for (let i = 0; i < 4; i++) {
      this.fire.spawn({
        x: p.x,
        y: p.y,
        z: p.z,
        vx: (Math.random() - 0.5) * 14,
        vy: Math.random() * 10,
        vz: (Math.random() - 0.5) * 14,
        life: 0.18 + Math.random() * 0.15,
        size: 0.8,
        sizeEnd: 0.2,
        color,
        colorEnd: 0xff6020,
        gravity: 20,
      });
    }
  }

  /** Sand kicked up where a round hits the ground. */
  dustHit(p: THREE.Vector3, size = 1): void {
    for (let i = 0; i < 5; i++) {
      this.smoke.spawn({
        x: p.x + (Math.random() - 0.5) * size,
        y: p.y + 0.3,
        z: p.z + (Math.random() - 0.5) * size,
        vx: (Math.random() - 0.5) * 6,
        vy: 3 + Math.random() * 5 * size,
        vz: (Math.random() - 0.5) * 6,
        life: 0.6 + Math.random() * 0.5,
        size: size * 1.2,
        sizeEnd: size * 3,
        color: this.hitStart,
        colorEnd: this.hitEnd,
        alpha: 0.55,
        drag: 2,
      });
    }
  }

  muzzleFlash(p: THREE.Vector3, dir: THREE.Vector3): void {
    this.fire.spawn({
      x: p.x + dir.x,
      y: p.y + dir.y,
      z: p.z + dir.z,
      life: 0.06,
      size: 2.6,
      sizeEnd: 1.2,
      color: 0xfff1b0,
      alpha: 0.9,
    });
  }

  /**
   * Rocket exhaust laid down along the segment the round just flew, so the
   * trail is continuous at any speed. Puffs start small and hot behind the
   * nozzle, then swell, cool to grey and hang for seconds with a little
   * turbulence, which is what makes a missile's path readable after the fact.
   */
  rocketTrail(from: THREE.Vector3, to: THREE.Vector3, big: boolean): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    let len = Math.hypot(dx, dy, dz);
    let ux = 0;
    let uy = -1;
    let uz = 0;
    if (len > 1e-4) {
      ux = dx / len;
      uy = dy / len;
      uz = dz / len;
    } else len = 0;
    const nozzle = big ? 1.9 : 1.3;
    const spacing = big ? 0.7 : 0.9;
    const n = Math.max(1, Math.round(len / spacing));
    for (let i = 0; i < n; i++) {
      const t = (i + Math.random()) / n;
      const x = from.x + dx * t - ux * nozzle;
      const y = from.y + dy * t - uy * nozzle;
      const z = from.z + dz * t - uz * nozzle;
      // Exhaust leaves the nozzle rearward, then the plume expands sideways.
      const side = (Math.random() - 0.5) * (big ? 1.4 : 1.0);
      const side2 = (Math.random() - 0.5) * (big ? 1.4 : 1.0);
      this.smoke.spawn({
        x,
        y,
        z,
        vx: -ux * 3 + side,
        vy: -uy * 3 + 0.5 + Math.random() * 0.4,
        vz: -uz * 3 + side2,
        life: big ? 2.6 + Math.random() * 1.2 : 1.2 + Math.random() * 0.6,
        size: big ? 0.45 : 0.3,
        sizeEnd: big ? 3.6 + Math.random() * 1.2 : 2.2,
        color: 0xf4f3ef,
        colorEnd: big ? 0x8c8c89 : 0xa6a6a2,
        alpha: big ? 0.55 : 0.45,
        drag: 2.2,
      });
    }
    // Motor flame at the nozzle: a white-hot core inside an orange tongue.
    this.fire.spawn({
      x: to.x - ux * (nozzle - 0.3),
      y: to.y - uy * (nozzle - 0.3),
      z: to.z - uz * (nozzle - 0.3),
      vx: -ux * 12,
      vy: -uy * 12,
      vz: -uz * 12,
      life: 0.09,
      size: big ? 2.6 : 1.5,
      sizeEnd: 0.4,
      color: 0xffb060,
      colorEnd: 0xff4a10,
      alpha: 0.85,
    });
    this.fire.spawn({
      x: to.x - ux * (nozzle - 0.6),
      y: to.y - uy * (nozzle - 0.6),
      z: to.z - uz * (nozzle - 0.6),
      life: 0.06,
      size: big ? 1.4 : 0.9,
      sizeEnd: 0.5,
      color: 0xfff6dc,
      alpha: 1,
    });
  }

  /**
   * A burning decoy flare: a flickering magnesium core with a wide soft glow,
   * sparks spat out and pulled down by gravity, and a ribbon of white smoke
   * that rises off the flame and greys as it spreads.
   */
  flareBurn(p: THREE.Vector3, vel: THREE.Vector3, grounded: boolean): void {
    const flick = 0.8 + Math.random() * 0.6;
    this.fire.spawn({ x: p.x, y: p.y, z: p.z, life: 0.12, size: 2.2 * flick, sizeEnd: 1.2, color: 0xfff8e0, colorEnd: 0xffc060, alpha: 1 });
    this.fire.spawn({ x: p.x, y: p.y, z: p.z, life: 0.2, size: 5.5 * flick, sizeEnd: 3.5, color: 0xffb050, colorEnd: 0xff6020, alpha: 0.28 });
    if (Math.random() < 0.7) {
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 6;
      this.fire.spawn({
        x: p.x,
        y: p.y,
        z: p.z,
        vx: Math.cos(a) * sp + vel.x * 0.3,
        vy: 2 + Math.random() * 5,
        vz: Math.sin(a) * sp + vel.z * 0.3,
        life: 0.35 + Math.random() * 0.4,
        size: 0.35,
        sizeEnd: 0.1,
        color: 0xfff0c0,
        colorEnd: 0xff7030,
        alpha: 1,
        gravity: 18,
        drag: 1.5,
      });
    }
    this.smoke.spawn({
      x: p.x + (Math.random() - 0.5) * 0.6,
      y: p.y + 0.3,
      z: p.z + (Math.random() - 0.5) * 0.6,
      vx: (Math.random() - 0.5) * 1.5 + vel.x * 0.15,
      vy: 2.2 + Math.random() * 1.5,
      vz: (Math.random() - 0.5) * 1.5 + vel.z * 0.15,
      life: grounded ? 2.6 : 2.0,
      size: 0.6,
      sizeEnd: 3.4 + Math.random(),
      color: 0xf6f6f2,
      colorEnd: 0xa9a9a6,
      alpha: 0.5,
      drag: 1.3,
    });
  }

  /**
   * Rotor downwash. Real wash is a fast outward sheet that curls up into a
   * ring, so grains leave the disc edge with outward and tangential speed,
   * loft briefly, then settle. Many small short-lived grains read far better
   * than a few large puffs.
   */
  rotorWash(x: number, groundY: number, z: number, strength: number, driftX: number, driftZ: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      // Bias spawns toward the disc edge, where the sheet actually strikes.
      const r = 2.5 + Math.sqrt(Math.random()) * 6.5;
      const out = (4.5 + Math.random() * 7) * strength;
      const swirl = (2.5 + Math.random() * 4.5) * strength;
      const tx = -Math.sin(a);
      const tz = Math.cos(a);
      this.dust.spawn({
        x: x + Math.cos(a) * r,
        y: groundY + 0.1 + Math.random() * 0.55,
        z: z + Math.sin(a) * r,
        vx: Math.cos(a) * out + tx * swirl + driftX * 0.4,
        vy: 0.5 + Math.random() * 1.9,
        vz: Math.sin(a) * out + tz * swirl + driftZ * 0.4,
        life: 0.45 + Math.random() * 0.75,
        size: 0.35 + Math.random() * 0.7,
        sizeEnd: 1.6 + Math.random() * 1.7,
        color: this.dustStart,
        colorEnd: this.dustEnd,
        alpha: (0.12 + Math.random() * 0.1) * strength,
        drag: 2.4,
        gravity: 1.1,
      });
    }
  }

  /**
   * Jungle downwash: leaf litter and grass torn off the floor. Small hard
   * flecks in greens and browns spiral outward and up, then flutter down.
   */
  leafWash(x: number, groundY: number, z: number, strength: number, driftX: number, driftZ: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.sqrt(Math.random()) * 8;
      const out = (3 + Math.random() * 6) * strength;
      const swirl = (3 + Math.random() * 5) * strength;
      const tx = -Math.sin(a);
      const tz = Math.cos(a);
      const c = LEAF_COLORS[(Math.random() * LEAF_COLORS.length) | 0];
      this.dust.spawn({
        x: x + Math.cos(a) * r,
        y: groundY + 0.1 + Math.random() * 0.4,
        z: z + Math.sin(a) * r,
        vx: Math.cos(a) * out + tx * swirl + driftX * 0.3,
        vy: 1.2 + Math.random() * 2.5 * strength,
        vz: Math.sin(a) * out + tz * swirl + driftZ * 0.3,
        life: 0.7 + Math.random() * 0.8,
        size: 0.18 + Math.random() * 0.16,
        sizeEnd: 0.12 + Math.random() * 0.1,
        color: c,
        colorEnd: c,
        alpha: 0.6,
        drag: 1.8,
        gravity: 6,
      });
    }
  }

  /**
   * Smoke off a damaged airframe, laid down along the segment it just flew so
   * the trail is continuous at speed. `heat` runs 0 (thin grey wisps) to 1
   * (oily black column): it sets colour, size, life and how buoyant it is.
   */
  hullSmoke(from: THREE.Vector3, to: THREE.Vector3, heat: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const z = from.z + (to.z - from.z) * t;
      // Most puffs are dark cores; a few are lighter, torn edges around them.
      const edge = Math.random() < 0.3;
      const dark = edge ? 0x3a3835 : heat > 0.5 ? 0x0e0d0c : 0x2a2826;
      const light = edge ? 0x8a8784 : heat > 0.5 ? 0x2b2927 : 0x6f6c68;
      const size = (edge ? 0.5 : 0.7) * (0.6 + heat * 1.6) * (0.8 + Math.random() * 0.5);
      this.smoke.spawn({
        x: x + (Math.random() - 0.5) * 0.7,
        y,
        z: z + (Math.random() - 0.5) * 0.7,
        vx: (Math.random() - 0.5) * 2.4,
        vy: 1.5 + Math.random() * 2.5 + heat * 1.5,
        vz: (Math.random() - 0.5) * 2.4,
        life: 1.4 + Math.random() * 1.6 + heat * 1.6,
        size,
        sizeEnd: size * (3.2 + Math.random() * 1.4),
        color: mixHex(0x8a8683, dark, heat * 1.35),
        colorEnd: mixHex(0xb0adaa, light, heat * 1.35),
        alpha: 0.35 + heat * 0.5,
        drag: 1.3,
        gravity: -1 - heat * 1.5,
      });
    }
  }

  /**
   * Fire out of a damaged hull: a white-hot core that barely leaves the vent,
   * orange tongues torn upward and back by the airflow, and every so often an
   * ember that arcs away and dies.
   */
  hullFire(p: THREE.Vector3, size: number, driftX: number, driftZ: number): void {
    this.fire.spawn({
      x: p.x + (Math.random() - 0.5) * size * 0.4,
      y: p.y,
      z: p.z + (Math.random() - 0.5) * size * 0.4,
      vx: driftX * 0.3,
      vy: 1.5 + Math.random(),
      vz: driftZ * 0.3,
      life: 0.1 + Math.random() * 0.08,
      size: size * 0.7,
      sizeEnd: size * 0.3,
      color: 0xfff6dc,
      colorEnd: 0xffd080,
      alpha: 1,
    });
    this.fire.spawn({
      x: p.x + (Math.random() - 0.5) * size * 0.9,
      y: p.y + 0.2,
      z: p.z + (Math.random() - 0.5) * size * 0.9,
      vx: (Math.random() - 0.5) * 3 + driftX * 0.7,
      vy: 3 + Math.random() * 4,
      vz: (Math.random() - 0.5) * 3 + driftZ * 0.7,
      life: 0.3 + Math.random() * 0.35,
      size: size * (1.0 + Math.random() * 0.8),
      sizeEnd: size * 0.25,
      color: 0xffb060,
      colorEnd: 0x9a2408,
      alpha: 0.9,
      drag: 2.2,
    });
    if (Math.random() < 0.25) {
      const a = Math.random() * Math.PI * 2;
      this.fire.spawn({
        x: p.x,
        y: p.y,
        z: p.z,
        vx: Math.cos(a) * (3 + Math.random() * 5) + driftX * 0.4,
        vy: 4 + Math.random() * 6,
        vz: Math.sin(a) * (3 + Math.random() * 5) + driftZ * 0.4,
        life: 0.5 + Math.random() * 0.6,
        size: 0.32,
        sizeEnd: 0.08,
        color: 0xffe0a0,
        colorEnd: 0xff5a20,
        alpha: 1,
        gravity: 16,
        drag: 0.8,
      });
    }
  }

  /** Burning fuel spilling off the airframe: a fast, hot drip that streaks down and snuffs out. */
  fuelDrip(p: THREE.Vector3, driftX: number, driftZ: number): void {
    this.fire.spawn({
      x: p.x + (Math.random() - 0.5) * 1.2,
      y: p.y - 0.6,
      z: p.z + (Math.random() - 0.5) * 1.2,
      vx: driftX * 0.5 + (Math.random() - 0.5) * 2,
      vy: -2 - Math.random() * 3,
      vz: driftZ * 0.5 + (Math.random() - 0.5) * 2,
      life: 0.7 + Math.random() * 0.6,
      size: 0.45,
      sizeEnd: 0.1,
      color: 0xffc070,
      colorEnd: 0xff3a10,
      alpha: 1,
      gravity: 22,
      drag: 0.4,
    });
    this.smoke.spawn({
      x: p.x,
      y: p.y - 0.4,
      z: p.z,
      vx: driftX * 0.4,
      vy: -1,
      vz: driftZ * 0.4,
      life: 0.9,
      size: 0.35,
      sizeEnd: 1.4,
      color: 0x1a1816,
      colorEnd: 0x3a3634,
      alpha: 0.5,
      gravity: 6,
      drag: 1,
    });
  }

  /** Electrical burst from shorted wiring: white-blue sparks scattering and a puff of pale smoke. */
  electricSpark(p: THREE.Vector3): void {
    for (let i = 0; i < 6; i++) {
      this.fire.spawn({
        x: p.x,
        y: p.y,
        z: p.z,
        vx: (Math.random() - 0.5) * 10,
        vy: 1 + Math.random() * 6,
        vz: (Math.random() - 0.5) * 10,
        life: 0.15 + Math.random() * 0.2,
        size: 0.35,
        sizeEnd: 0.08,
        color: 0xe8f4ff,
        colorEnd: 0x7fb0ff,
        alpha: 1,
        gravity: 14,
      });
    }
    this.fire.spawn({ x: p.x, y: p.y, z: p.z, life: 0.08, size: 2.2, sizeEnd: 0.8, color: 0xdff0ff, alpha: 0.8 });
    this.smoke.spawn({ x: p.x, y: p.y, z: p.z, vy: 1.5, life: 0.9, size: 0.6, sizeEnd: 2.0, color: 0x9a9a9a, colorEnd: 0xc0c0c0, alpha: 0.4, drag: 1.5 });
  }

  /** A gas flare burning off a stack: a licking orange flame with a thin dark plume. */
  flareStack(p: THREE.Vector3): void {
    this.fire.spawn({
      x: p.x + (Math.random() - 0.5) * 0.6,
      y: p.y,
      z: p.z + (Math.random() - 0.5) * 0.6,
      vx: (Math.random() - 0.5) * 2,
      vy: 5 + Math.random() * 4,
      vz: (Math.random() - 0.5) * 2,
      life: 0.35 + Math.random() * 0.25,
      size: 1.6 + Math.random() * 0.8,
      sizeEnd: 0.4,
      color: 0xffd070,
      colorEnd: 0xff5010,
      alpha: 0.9,
    });
    if (Math.random() < 0.5) {
      this.smoke.spawn({ x: p.x, y: p.y + 2, z: p.z, vx: 1.5, vy: 3, vz: 0.5, life: 2.5, size: 1.0, sizeEnd: 4, color: 0x2a2624, colorEnd: 0x6a6664, alpha: 0.35, drag: 1 });
    }
  }

  /** Water thrown up by a blast or a dropped mine: a white column that falls back and a spreading ring of spray. */
  splash(p: THREE.Vector3, size: number): void {
    const n = Math.round(10 + size * 8);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * size * 0.8;
      this.dust.spawn({
        x: p.x + Math.cos(a) * r,
        y: 0.2,
        z: p.z + Math.sin(a) * r,
        vx: Math.cos(a) * (2 + Math.random() * 4) * size * 0.5,
        vy: (6 + Math.random() * 10) * size * 0.6,
        vz: Math.sin(a) * (2 + Math.random() * 4) * size * 0.5,
        life: 0.9 + Math.random() * 0.7,
        size: size * 0.5,
        sizeEnd: size * 1.6,
        color: 0xeaf6f8,
        colorEnd: 0x9fcbd0,
        alpha: 0.75,
        drag: 1.2,
        gravity: 14,
      });
    }
    const ringN = Math.round(8 + size * 6);
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * Math.PI * 2;
      this.dust.spawn({
        x: p.x + Math.cos(a) * size,
        y: 0.3,
        z: p.z + Math.sin(a) * size,
        vx: Math.cos(a) * 9 * size * 0.5,
        vy: 1.5,
        vz: Math.sin(a) * 9 * size * 0.5,
        life: 0.8,
        size: size * 0.6,
        sizeEnd: size * 2.2,
        color: 0xf2fafa,
        colorEnd: 0xb9dde0,
        alpha: 0.5,
        drag: 3,
        gravity: 3,
      });
    }
  }

  /** Foam churned up behind a boat: white puffs spreading from the stern at the water line. */
  wake(x: number, z: number, fx: number, fz: number, stern: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const side = (Math.random() - 0.5) * 2;
      this.dust.spawn({
        x: x - fx * stern + -fz * side * 1.2,
        y: 0.15,
        z: z - fz * stern + fx * side * 1.2,
        vx: -fx * 1.5 + -fz * side * (1 + Math.random() * 1.5),
        vy: 0,
        vz: -fz * 1.5 + fx * side * (1 + Math.random() * 1.5),
        life: 1.2 + Math.random() * 0.8,
        size: 0.7,
        sizeEnd: 3.2,
        color: 0xe6efe9,
        colorEnd: 0x9fbdb4,
        alpha: 0.3,
        drag: 2,
        gravity: 0,
      });
    }
  }

  /** Persistent smoke column from a wreck or damaged unit. */
  burningSmoke(p: THREE.Vector3, size: number): void {
    this.smoke.spawn({
      x: p.x + (Math.random() - 0.5) * size,
      y: p.y + 0.5,
      z: p.z + (Math.random() - 0.5) * size,
      vx: (Math.random() - 0.5) * 1.5,
      vy: 3 + Math.random() * 2,
      vz: (Math.random() - 0.5) * 1.5,
      life: 2 + Math.random() * 1.5,
      size: size,
      sizeEnd: size * 3.5,
      color: 0x2b2926,
      colorEnd: 0x5c5955,
      alpha: 0.6,
      drag: 0.8,
    });
    if (Math.random() < 0.5) {
      this.fire.spawn({
        x: p.x + (Math.random() - 0.5) * size * 0.6,
        y: p.y + 0.6,
        z: p.z + (Math.random() - 0.5) * size * 0.6,
        vy: 2 + Math.random() * 2,
        life: 0.3 + Math.random() * 0.3,
        size: size * 0.9,
        sizeEnd: 0.2,
        color: 0xffa040,
        colorEnd: 0xff3000,
        alpha: 0.8,
      });
    }
  }

  tracer(p: THREE.Vector3): void {
    this.fire.spawn({ x: p.x, y: p.y, z: p.z, life: 0.07, size: 0.4, sizeEnd: 0.12, color: 0xffe9a0, alpha: 0.45 });
  }
}
