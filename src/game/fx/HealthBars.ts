import * as THREE from "three/webgpu";
import { color, instancedBufferAttribute, mix, min, saturate, step, uv, vec2, vec4 } from "three/tsl";
import type { Entity } from "../entities/Entity";

const MAX_BARS = 64;
/** How long a bar lingers after the last hit, and how long it takes to fade. */
const HOLD = 3.0;
const FADE = 0.7;

const BAR_W = 11.5;
const BAR_H = 1.6;

/**
 * Damage bars over ground targets, drawn as one instanced sprite so the whole
 * set costs a single draw call. A bar appears when a target is hit and fades
 * out once it stops taking fire.
 */
export class HealthBars {
  readonly sprite: THREE.Sprite;
  private readonly posAttr: THREE.InstancedBufferAttribute;
  private readonly dataAttr: THREE.InstancedBufferAttribute;

  constructor() {
    this.posAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BARS * 3), 3);
    // x = health ratio, y = alpha, z and w spare.
    this.dataAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BARS * 4), 4);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.dataAttr.setUsage(THREE.DynamicDrawUsage);

    const mat = new THREE.SpriteNodeMaterial();
    mat.positionNode = instancedBufferAttribute<"vec3">(this.posAttr, "vec3");
    mat.scaleNode = vec2(BAR_W, BAR_H);
    const data = instancedBufferAttribute<"vec4">(this.dataAttr, "vec4");
    const ratio = data.x;
    const alpha = data.y;

    const u = uv();
    // Distance to the nearest edge of the quad, used for the frame.
    const edge = min(min(u.x, u.x.oneMinus()), min(u.y, u.y.oneMinus()));
    const isFrame = step(edge, 0.1);
    const isFill = step(u.x, ratio);

    // Green when healthy, amber at half, red when nearly destroyed.
    const low = saturate(ratio.mul(2));
    const high = saturate(ratio.sub(0.5).mul(2));
    const health = mix(mix(color(0xff4a2c), color(0xf2b64a), low), color(0x9fd45a), high);

    const body = mix(color(0x0d100c), health, isFill);
    const rgb = mix(body, color(0x050704), isFrame);
    // The empty part of the track stays translucent so it reads as a gauge.
    const bodyAlpha = mix(0.55, 1.0, isFill);
    const cellAlpha = mix(bodyAlpha, 1.0, isFrame);

    mat.colorNode = vec4(rgb, cellAlpha.mul(alpha));
    mat.transparent = true;
    mat.depthWrite = false;
    mat.fog = false;

    this.sprite = new THREE.Sprite(mat);
    this.sprite.count = 0;
    this.sprite.frustumCulled = false;
    this.sprite.renderOrder = 12;
    this.sprite.name = "health-bars";
  }

  /** Rebuild the visible set from entities hit recently. */
  update(entities: readonly Entity[], time: number): void {
    const pa = this.posAttr.array as Float32Array;
    const da = this.dataAttr.array as Float32Array;
    let n = 0;
    for (const e of entities) {
      if (n >= MAX_BARS) break;
      if (!e.alive || !e.showHealthBar) continue;
      const since = time - e.lastHitAt;
      if (since > HOLD || e.hp >= e.maxHp) continue;
      pa[n * 3] = e.pos.x;
      pa[n * 3 + 1] = e.pos.y + e.barHeight;
      pa[n * 3 + 2] = e.pos.z;
      da[n * 4] = Math.max(0, Math.min(1, e.hp / e.maxHp));
      da[n * 4 + 1] = since > HOLD - FADE ? 1 - (since - (HOLD - FADE)) / FADE : 1;
      n++;
    }
    this.sprite.count = n;
    if (n > 0) {
      this.posAttr.needsUpdate = true;
      this.dataAttr.needsUpdate = true;
    }
  }

  dispose(): void {
    // Sprite geometry is shared by every Sprite in three.js; only the material is ours.
    (this.sprite.material as THREE.Material).dispose();
  }
}
