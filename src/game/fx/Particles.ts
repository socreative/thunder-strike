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
  private cursor = 0;
  aliveCount = 0;

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
    this.sprite.count = max;
    this.sprite.frustumCulled = false;
    this.sprite.renderOrder = renderOrder;
    this.sprite.name = additive ? "particles-additive" : "particles-normal";
  }

  spawn(o: ParticleOpts): void {
    // Ring buffer: overwrite the oldest slot when full.
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    if (this.life[i] <= 0) this.aliveCount++;
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
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      let l = this.life[i];
      if (l <= 0) {
        sa[i] = 0;
        ca[i * 4 + 3] = 0;
        continue;
      }
      l -= dt;
      this.life[i] = l;
      if (l <= 0) {
        sa[i] = 0;
        ca[i * 4 + 3] = 0;
        continue;
      }
      alive++;
      const k = 1 - l / this.maxLife[i]; // 0 at birth, 1 at death
      const dr = 1 - this.drag[i] * dt;
      this.vel[i * 3] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      pa[i * 3] = this.pos[i * 3];
      pa[i * 3 + 1] = this.pos[i * 3 + 1];
      pa[i * 3 + 2] = this.pos[i * 3 + 2];
      sa[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * k;
      ca[i * 4] = this.col0[i * 3] + (this.col1[i * 3] - this.col0[i * 3]) * k;
      ca[i * 4 + 1] = this.col0[i * 3 + 1] + (this.col1[i * 3 + 1] - this.col0[i * 3 + 1]) * k;
      ca[i * 4 + 2] = this.col0[i * 3 + 2] + (this.col1[i * 3 + 2] - this.col0[i * 3 + 2]) * k;
      // Quick fade in, long fade out.
      const fade = Math.min(1, k * 6) * (1 - k * k);
      ca[i * 4 + 3] = this.alpha[i] * fade;
    }
    this.aliveCount = alive;
    this.posAttr.needsUpdate = true;
    this.scaleAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
  }

  dispose(): void {
    // Sprite geometry is shared by every Sprite in three.js; only the material is ours.
    (this.sprite.material as THREE.Material).dispose();
  }
}

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
    this.smoke.update(dt);
    this.dust.update(dt);
    this.fire.update(dt);
  }

  clear(): void {
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

  explosion(p: THREE.Vector3, size: number): void {
    const n = Math.round(6 + size * 4);
    // flash
    this.fire.spawn({ x: p.x, y: p.y, z: p.z, life: 0.16, size: size * 6, sizeEnd: size * 9, color: 0xfff4d0, alpha: 1 });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * size * 1.5;
      const up = 4 + Math.random() * 6 * size;
      this.fire.spawn({
        x: p.x + Math.cos(a) * r * 0.4,
        y: p.y + Math.random() * size,
        z: p.z + Math.sin(a) * r * 0.4,
        vx: Math.cos(a) * r * 2,
        vy: up,
        vz: Math.sin(a) * r * 2,
        life: 0.35 + Math.random() * 0.4,
        size: size * (1.6 + Math.random()),
        sizeEnd: size * 0.4,
        color: 0xffc860,
        colorEnd: 0xff3a10,
        alpha: 0.9,
        drag: 3,
      });
    }
    const smokeN = Math.round(5 + size * 3);
    for (let i = 0; i < smokeN; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * size;
      this.smoke.spawn({
        x: p.x + Math.cos(a) * r,
        y: p.y + Math.random() * size * 0.5,
        z: p.z + Math.sin(a) * r,
        vx: Math.cos(a) * r * 1.2,
        vy: 4 + Math.random() * 5,
        vz: Math.sin(a) * r * 1.2,
        life: 1.4 + Math.random() * 1.6 * size * 0.5,
        size: size * 1.8,
        sizeEnd: size * 4.5,
        color: 0x3a3632,
        colorEnd: 0x6e6a66,
        alpha: 0.75,
        drag: 1.5,
        gravity: -1.2,
      });
    }
    // debris sparks
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 8 + Math.random() * 16 * size * 0.6;
      this.fire.spawn({
        x: p.x,
        y: p.y + 0.5,
        z: p.z,
        vx: Math.cos(a) * sp,
        vy: 6 + Math.random() * 14,
        vz: Math.sin(a) * sp,
        life: 0.6 + Math.random() * 0.6,
        size: 0.5,
        sizeEnd: 0.15,
        color: 0xffd080,
        colorEnd: 0xff5020,
        gravity: 25,
        drag: 0.6,
      });
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
    this.fire.spawn({ x: p.x, y: p.y, z: p.z, life: 0.08, size: 1.1, sizeEnd: 0.3, color: 0xffe9a0, alpha: 0.7 });
  }
}
