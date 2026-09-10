import * as THREE from "three/webgpu";
import type { Helicopter } from "./Helicopter";
import { Entity, type Team } from "./Entity";
import { balance } from "../data/balance";

export type ProjectileKind = "gun" | "hydra" | "hellfire" | "shell" | "aa" | "rifle" | "sam";

interface KindSpec {
  speed: number;
  damage: number;
  life: number;
  splash: number;
  radius: number;
  homing?: { turnRate: number; maxSpeed: number; accel: number };
  trail?: "small" | "big";
  hp?: number;
  proximity?: number;
}

const w = balance.weapons;
const e = balance.enemyShots;

const SPECS: Record<ProjectileKind, KindSpec> = {
  gun: { speed: w.gun.speed, damage: w.gun.damage, life: w.gun.life, splash: 0, radius: 0.7 },
  hydra: { speed: w.hydra.speed, damage: w.hydra.damage, life: w.hydra.life, splash: w.hydra.splash, radius: 1.0, trail: "small" },
  hellfire: {
    speed: w.hellfire.speed,
    damage: w.hellfire.damage,
    life: w.hellfire.life,
    splash: w.hellfire.splash,
    radius: 1.2,
    homing: { turnRate: w.hellfire.turnRate, maxSpeed: 120, accel: 40 },
    trail: "big",
  },
  shell: { speed: e.shell.speed, damage: e.shell.damage, life: e.shell.life, splash: e.shell.splash, radius: 1.0, trail: "small" },
  aa: { speed: e.aa.speed, damage: e.aa.damage, life: e.aa.life, splash: 0, radius: 0.8 },
  rifle: { speed: e.rifle.speed, damage: e.rifle.damage, life: e.rifle.life, splash: 0, radius: 0.5 },
  sam: {
    speed: e.sam.speed,
    damage: e.sam.damage,
    life: e.sam.life,
    splash: e.sam.splash,
    radius: 1.6,
    homing: { turnRate: e.sam.turnRate, maxSpeed: e.sam.maxSpeed, accel: e.sam.accel },
    trail: "big",
    hp: e.sam.hp,
    proximity: e.sam.proximity,
  },
};

/* Shared geometry and materials, built lazily so module import stays cheap. */
let visuals: Record<ProjectileKind, { geo: THREE.BufferGeometry; mat: THREE.Material }> | null = null;

function getVisuals() {
  if (visuals) return visuals;
  const glow = (color: number) => {
    const m = new THREE.MeshBasicNodeMaterial({ color });
    m.fog = false;
    return m;
  };
  const metal = (color: number) => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.5, metalness: 0.4 });
  const rocket = (r: number, len: number) => {
    const g = new THREE.CylinderGeometry(r, r, len, 8);
    g.rotateX(Math.PI / 2);
    return g;
  };
  visuals = {
    gun: { geo: new THREE.BoxGeometry(0.28, 0.28, 2.6), mat: glow(0xffe090) },
    aa: { geo: new THREE.BoxGeometry(0.35, 0.35, 3.0), mat: glow(0xff8050) },
    rifle: { geo: new THREE.BoxGeometry(0.18, 0.18, 1.6), mat: glow(0xfff0c0) },
    hydra: { geo: rocket(0.28, 2.4), mat: metal(0x6d7a6a) },
    hellfire: { geo: rocket(0.42, 3.6), mat: metal(0x3d4a44) },
    shell: { geo: new THREE.SphereGeometry(0.55, 8, 6), mat: metal(0x2a2a2a) },
    sam: { geo: rocket(0.5, 4.6), mat: metal(0xe8e8e0) },
  };
  return visuals;
}

const Z = new THREE.Vector3(0, 0, 1);
const tmpDir = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const hits: Entity[] = [];

export class Projectile extends Entity {
  readonly vel = new THREE.Vector3();
  readonly projKind: ProjectileKind;
  private life: number;
  private spec: KindSpec;
  private trailTimer = 0;
  target: Entity | null = null;
  owner: Entity | null = null;
  /** Lured onto a flare: it will burst harmlessly. */
  decoyed = false;
  private readonly prev = new THREE.Vector3();
  private speed: number;

  constructor(kind: ProjectileKind, pos: THREE.Vector3, dir: THREE.Vector3, team: Team, owner: Entity | null, target: Entity | null = null) {
    super();
    this.projKind = kind;
    this.kind = "projectile";
    this.spec = SPECS[kind];
    this.team = team;
    this.owner = owner;
    this.target = target;
    this.life = this.spec.life;
    this.speed = this.spec.speed;
    this.pos.copy(pos);
    this.prev.copy(pos);
    this.vel.copy(dir).normalize().multiplyScalar(this.speed);
    this.radius = this.spec.radius;
    this.hp = this.maxHp = this.spec.hp ?? 1;
    this.targetable = this.spec.hp !== undefined;
    this.blip = false;
    this.showHealthBar = false;
    const v = getVisuals()[kind];
    const mesh = new THREE.Mesh(v.geo, v.mat);
    mesh.castShadow = kind === "hellfire" || kind === "sam";
    this.object.add(mesh);
    this.orient();
    this.syncObject();
  }

  private orient(): void {
    tmpDir.copy(this.vel).normalize();
    this.object.quaternion.setFromUnitVectors(Z, tmpDir);
  }

  update(dt: number): void {
    const world = this.world;
    this.life -= dt;
    if (this.life <= 0) {
      this.fizzle();
      return;
    }

    if (this.spec.homing) {
      if (this.target && !this.target.alive) this.target = null;
      if (this.target) {
        tmpTarget.copy(this.target.pos);
        // Aim a little above ground targets so the missile does not plough in early.
        if (this.target.kind !== "helicopter") tmpTarget.y += 1.5;
        tmpDir.copy(tmpTarget).sub(this.pos).normalize();
        const cur = this.vel.clone().normalize();
        const angle = cur.angleTo(tmpDir);
        const maxStep = this.spec.homing.turnRate * dt;
        if (angle > 1e-4) {
          const t = Math.min(1, maxStep / angle);
          cur.lerp(tmpDir, t).normalize();
        }
        this.speed = Math.min(this.spec.homing.maxSpeed, this.speed + this.spec.homing.accel * dt);
        this.vel.copy(cur).multiplyScalar(this.speed);
        // Proximity fuse.
        if (this.spec.proximity && this.pos.distanceTo(this.target.pos) < this.spec.proximity + this.target.radius) {
          this.detonate(this.target);
          return;
        }
      } else {
        this.speed = Math.min(this.spec.homing.maxSpeed, this.speed + this.spec.homing.accel * dt);
        this.vel.normalize().multiplyScalar(this.speed);
      }
    }

    // Enemy ground fire droops toward the ground slowly for a shell-like arc.
    if (this.projKind === "shell") this.vel.y -= 6 * dt;

    this.prev.copy(this.pos);
    this.pos.addScaledVector(this.vel, dt);
    this.orient();
    this.syncObject();
    // Without this a projectile stays in its launch cell and can never be hit.
    world.grid.update(this);

    if (this.spec.trail) {
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = this.spec.trail === "big" ? 0.02 : 0.03;
        world.particles.rocketTrail(this.pos, this.spec.trail === "big");
      }
    } else if (this.projKind === "gun" && Math.random() < 0.5) {
      world.particles.tracer(this.pos);
    }

    // Ground and water impact.
    const ground = world.terrain.heightAt(this.pos.x, this.pos.z);
    const floor = Math.max(ground, 0);
    if (this.pos.y <= floor + 0.2) {
      this.pos.y = floor + 0.2;
      this.impactGround(ground < 0);
      return;
    }
    if (Math.abs(this.pos.x) > world.terrain.size / 2 + 20 || Math.abs(this.pos.z) > world.terrain.size / 2 + 20) {
      this.fizzle();
      return;
    }

    // Target hits. A gun round covers about four metres per step, so testing
    // only the end point would let it tunnel straight through a thin wall.
    // The broad phase spans the whole step, then each candidate is tested at
    // samples along it against its real footprint.
    const enemyTeam: Team = this.team === "player" ? "enemy" : "player";
    const pad = this.radius + (this.team === "player" ? 1.0 : 0.4);
    const stepLen = this.prev.distanceTo(this.pos);
    const midX = (this.prev.x + this.pos.x) / 2;
    const midZ = (this.prev.z + this.pos.z) / 2;
    world.grid.query(midX, midZ, pad + stepLen / 2, hits, (e) => e.team === enemyTeam && e.targetable && e !== this.owner);
    if (hits.length > 0) {
      const samples = Math.max(1, Math.ceil(stepLen / 1.2));
      for (let i = 1; i <= samples; i++) {
        const t = i / samples;
        const sx = this.prev.x + (this.pos.x - this.prev.x) * t;
        const sy = this.prev.y + (this.pos.y - this.prev.y) * t;
        const sz = this.prev.z + (this.pos.z - this.prev.z) * t;
        for (const h of hits) {
          if (!h.alive || !h.hitsXZ(sx, sz, pad)) continue;
          if (this.team === "player") {
            // Arcade rule, as in the original: anything under the round's path
            // is hit. Missiles in the air still need rough height agreement.
            if (h.kind === "projectile" && Math.abs(h.pos.y - sy) > 10) continue;
          } else {
            // Enemy fire has to actually reach the aircraft's altitude.
            const top = h.kind === "helicopter" ? h.pos.y + 3 : world.terrain.heightAt(h.pos.x, h.pos.z) + heightOf(h);
            const bottom = h.kind === "helicopter" ? h.pos.y - 3 : -10;
            if (sy > top + this.radius || sy < bottom) continue;
          }
          // Detonate where contact happened, not where the step ended.
          this.pos.set(sx, sy, sz);
          this.syncObject();
          this.detonate(h);
          return;
        }
      }
    }
  }

  private impactGround(water: boolean): void {
    const world = this.world;
    if (this.spec.splash > 0) {
      world.explode(this.pos, this.spec.splash, this.spec.damage, this.team, this.projKind === "hellfire" || this.projKind === "sam" ? 2.2 : 1.4, this.owner);
    } else if (water) {
      world.particles.dustHit(this.pos, 0.6);
    } else {
      world.particles.dustHit(this.pos, this.projKind === "aa" ? 0.8 : 0.6);
    }
    this.kill();
  }

  private detonate(hit: Entity): void {
    const world = this.world;
    if (this.decoyed) {
      // Chasing a flare: burst without hurting anyone.
      world.explode(this.pos, 2, 0, this.team, 1.8, this.owner);
      this.kill();
      return;
    }
    if (this.spec.splash > 0) {
      world.explode(this.pos, this.spec.splash, this.spec.damage, this.team, this.projKind === "hellfire" || this.projKind === "sam" ? 2.2 : 1.4, this.owner);
    } else {
      hit.damage(this.spec.damage, this.owner ?? undefined);
      world.particles.spark(this.pos);
      if (hit.kind === "helicopter") {
        world.audio.play("hit");
        (hit as Helicopter).push(this.vel.x, this.vel.z, this.spec.damage);
      }
    }
    this.kill();
  }

  private fizzle(): void {
    if (this.spec.homing) {
      this.world.explode(this.pos, 2, 0, this.team, 1.0, this.owner);
    }
    this.kill();
  }

  protected onHit(): void {
    // Missiles show a spark when shot at.
    this.world.particles.spark(this.pos, 0xffffff);
  }

  protected onDeath(): void {
    if (this.targetable && this.hp <= 0) {
      // Shot down mid-air.
      this.world.explode(this.pos, 3, 0, this.team, 1.6, this.owner);
      this.world.audio.play("explosionSmall");
    }
  }
}

function heightOf(e: Entity): number {
  switch (e.kind) {
    case "hq":
    case "prison":
    case "radar":
    case "building":
    case "tower":
      return 14;
    case "wall":
      return 5;
    case "infantry":
      return 3;
    default:
      return 5;
  }
}
