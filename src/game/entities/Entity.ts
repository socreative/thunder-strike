import * as THREE from "three/webgpu";
import type { World } from "../World";

export type Team = "player" | "enemy" | "neutral";

let nextId = 1;

const flashColor = new THREE.Color(0xff5533);

/** Base for everything that lives in the world and can be hit. */
export abstract class Entity {
  readonly id = nextId++;
  readonly pos = new THREE.Vector3();
  readonly object = new THREE.Group();
  radius = 3;
  hp = 100;
  maxHp = 100;
  team: Team = "enemy";
  alive = true;
  /** Included in spatial grid queries as a hit target. */
  targetable = true;
  /** Shown on the minimap as an enemy blip. */
  blip = true;
  kind = "entity";
  tag?: string;
  world!: World;
  /** Ground targets show a damage bar; the player, pickups and rounds do not. */
  showHealthBar = true;
  /** Height above the entity origin at which that bar floats. */
  barHeight = 5;
  /** World time of the most recent hit, used to fade the bar out. */
  lastHitAt = -999;
  private flashTimer = 0;
  private flashMats: THREE.MeshStandardNodeMaterial[] | null = null;

  /** Called once after the entity is added to the world. */
  onSpawn(): void {}

  update(dt: number): void {
    void dt;
  }

  damage(amount: number, source?: Entity): void {
    if (!this.alive) return;
    this.hp -= amount;
    this.lastHitAt = this.world.time;
    this.onHit(amount, source);
    if (this.hp <= 0) {
      this.hp = 0;
      this.kill(source);
    }
  }

  kill(source?: Entity): void {
    if (!this.alive) return;
    this.alive = false;
    this.onDeath(source);
    this.world.remove(this);
  }

  protected onHit(amount: number, source?: Entity): void {
    void amount;
    void source;
    this.flash();
  }

  protected onDeath(source?: Entity): void {
    void source;
  }

  /** Briefly tint the mesh when hit. Materials are cloned per entity on first use. */
  flash(): void {
    if (this.flashMats === null) {
      const mats: THREE.MeshStandardNodeMaterial[] = [];
      this.object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        let m = mesh.material as THREE.MeshStandardNodeMaterial;
        if (!m.emissive) return;
        if (!m.userData.flashClone) {
          m = m.clone() as THREE.MeshStandardNodeMaterial;
          m.userData.flashClone = true;
          m.userData.baseEmissive = m.emissive.getHex();
          mesh.material = m;
        }
        mats.push(m);
      });
      this.flashMats = mats;
    }
    this.flashTimer = 0.09;
    for (const m of this.flashMats) {
      m.emissive.copy(flashColor);
      m.emissiveIntensity = 1.5;
    }
  }

  /** Advance the hit flash. Subclasses call this from update. */
  protected tickFlash(dt: number): void {
    if (this.flashTimer <= 0 || !this.flashMats) return;
    this.flashTimer -= dt;
    if (this.flashTimer <= 0) this.resetFlash();
  }

  /** Immediately clear any hit tint, for example before the model is reused as debris. */
  resetFlash(): void {
    this.flashTimer = 0;
    if (!this.flashMats) return;
    for (const m of this.flashMats) {
      m.emissive.setHex(m.userData.baseEmissive ?? 0x000000);
      m.emissiveIntensity = 1;
    }
  }

  syncObject(): void {
    this.object.position.copy(this.pos);
  }

  dispose(): void {
    this.object.removeFromParent();
    this.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const m = mesh.material as THREE.Material;
        if (m.userData.flashClone) m.dispose();
      }
    });
  }

  distanceXZ(other: { pos: THREE.Vector3 } | THREE.Vector3): number {
    const p = (other as { pos?: THREE.Vector3 }).pos ?? (other as THREE.Vector3);
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    return Math.sqrt(dx * dx + dz * dz);
  }
}

export interface MatOpts {
  roughness?: number;
  metalness?: number;
  flat?: boolean;
  emissive?: number;
  side?: THREE.Side;
}

/** Shared materials so hundreds of props do not each compile a shader. */
const matCache = new Map<string, THREE.MeshStandardNodeMaterial>();
export function sharedMat(color: number, opts: MatOpts = {}): THREE.MeshStandardNodeMaterial {
  const key = `${color}|${opts.roughness ?? 0.8}|${opts.metalness ?? 0.1}|${opts.flat ? 1 : 0}|${opts.emissive ?? 0}|${opts.side ?? 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardNodeMaterial({
      color,
      roughness: opts.roughness ?? 0.8,
      metalness: opts.metalness ?? 0.1,
      flatShading: opts.flat ?? false,
      emissive: opts.emissive ?? 0x000000,
    });
    if (opts.side !== undefined) m.side = opts.side;
    matCache.set(key, m);
  }
  return m;
}

export function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), sharedMat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cylinder(rTop: number, rBottom: number, h: number, color: number, x = 0, y = 0, z = 0, segments = 10): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), sharedMat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
