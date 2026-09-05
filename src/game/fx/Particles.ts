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
    const soft = smoothstep(1.0, 0.25, d);
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

export class Particles {
  readonly smoke: Layer;
  readonly fire: Layer;
  readonly group = new THREE.Group();

  constructor(smokeMax = 2500, fireMax = 2500) {
    this.smoke = new Layer(smokeMax, false, 10);
    this.fire = new Layer(fireMax, true, 11);
    this.group.add(this.smoke.sprite, this.fire.sprite);
  }

  update(dt: number): void {
    this.smoke.update(dt);
    this.fire.update(dt);
  }

  clear(): void {
    this.smoke.clear();
    this.fire.clear();
  }

  dispose(): void {
    this.smoke.dispose();
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
        color: 0xd8bc86,
        colorEnd: 0xcbb283,
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

  rocketTrail(p: THREE.Vector3, big: boolean): void {
    this.smoke.spawn({
      x: p.x,
      y: p.y,
      z: p.z,
      vx: (Math.random() - 0.5) * 2,
      vy: 0.6,
      vz: (Math.random() - 0.5) * 2,
      life: big ? 1.6 : 0.8,
      size: big ? 1.6 : 0.9,
      sizeEnd: big ? 4.2 : 2.4,
      color: 0xd9d9d9,
      colorEnd: 0x9a9a9a,
      alpha: 0.55,
      drag: 1,
    });
    this.fire.spawn({
      x: p.x,
      y: p.y,
      z: p.z,
      life: 0.12,
      size: big ? 2.2 : 1.3,
      sizeEnd: 0.4,
      color: 0xffc070,
      colorEnd: 0xff4010,
      alpha: 0.9,
    });
  }

  /** Rotor wash ring under a low hovering helicopter. */
  rotorWash(x: number, y: number, z: number, strength: number): void {
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 4;
    this.smoke.spawn({
      x: x + Math.cos(a) * r,
      y: y + 0.4,
      z: z + Math.sin(a) * r,
      vx: Math.cos(a) * 9 * strength,
      vy: 1.2 + Math.random() * 1.5,
      vz: Math.sin(a) * 9 * strength,
      life: 0.9 + Math.random() * 0.6,
      size: 2.2,
      sizeEnd: 5.5,
      color: 0xe0c48e,
      colorEnd: 0xd5bb88,
      alpha: 0.12 * strength,
      drag: 2.2,
    });
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
