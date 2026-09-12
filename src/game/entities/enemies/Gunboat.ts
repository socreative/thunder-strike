import * as THREE from "three/webgpu";
import { Entity } from "../Entity";
import { Wreck } from "../Wreck";
import { balance } from "../../data/balance";
import { angleDelta, headingTo, turnToward } from "../../core/MathUtil";
import { shoreAvoid } from "./water";
import { Build, PALETTE as P } from "../../world/Detail";
import type { RiverHit } from "../../world/Terrain";
import { leadTarget } from "./aim";

const S = balance.enemies.gunboat;
const tmpMuzzle = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpHit: RiverHit = { sd: 0, w: 0, cx: 0, cz: 0 };
const near: Entity[] = [];

/**
 * River patrol boat: runs a waypoint loop on the water, keeps off the banks,
 * and rakes the aircraft with a deck gun when it comes in range.
 */
export class Gunboat extends Entity {
  /** Bob and roll live here; the heading stays on `object` because hit tests read it. */
  private hull = new THREE.Group();
  private mount = new THREE.Group();
  private heading: number;
  private gunYaw = 0;
  private reload = Math.random() * S.reload;
  private burstLeft = 0;
  private burstTimer = 0;
  private wpIndex = 0;
  private t = Math.random() * 10;
  private wakeCarry = 0;
  private smokeTimer = 0;

  constructor(
    heading: number,
    private readonly waypoints: [number, number][] | undefined,
  ) {
    super();
    this.kind = "gunboat";
    this.hp = this.maxHp = S.hp;
    this.barHeight = 4.8;
    this.heading = heading;
    this.footprint = { hx: 2.6, hz: S.length / 2 };
    this.radius = Math.hypot(this.footprint.hx, this.footprint.hz);
    this.object.add(this.hull);
    this.hull.add(this.mount);
  }

  onSpawn(): void {
    // The spawner snapped us to the river bed; boats float.
    this.pos.y = 0;
    const asset = this.world.assets.get("boat");
    const size = this.world.assets.size("boat");
    if (asset && size) {
      const s = S.length / Math.max(size.x, size.z);
      asset.scale.multiplyScalar(s);
      if (size.x > size.z) asset.rotation.y += Math.PI / 2;
      asset.position.y = -size.y * s * 0.22;
      this.hull.add(asset);
      this.footprint = { hx: (Math.min(size.x, size.z) * s) / 2, hz: S.length / 2 };
      this.radius = Math.hypot(this.footprint.hx, this.footprint.hz);
      this.mount.position.set(0, size.y * s * 0.55, S.length * 0.22);
    } else {
      const b = new Build();
      b.box(4.4, 1.6, 13, P.metalDark, { y: 0.6 });
      b.box(4.0, 0.9, 3.5, P.oliveDark, { y: 1.6, z: 4.2, rx: -0.35 });
      b.box(3.2, 1.8, 4.2, P.olive, { y: 2.3, z: -1.5 });
      b.box(2.4, 0.6, 3.0, P.oliveDark, { y: 3.5, z: -1.5 });
      b.box(2.6, 0.7, 0.2, P.glass, { y: 2.6, z: 0.65, mat: { roughness: 0.25, metalness: 0.35 } });
      this.hull.add(b.finish());
      this.mount.position.set(0, 1.5, 3.2);
    }
    // Deck gun on a pedestal, always procedural so it visibly tracks the aircraft.
    const g = new Build();
    g.cyl(0.55, 0.65, 0.5, P.metalDark, { y: 0.25, seg: 10 });
    g.box(0.8, 0.5, 0.9, P.olive, { y: 0.75 });
    g.box(1.3, 0.9, 0.12, P.olive, { y: 0.95, z: 0.5, rx: -0.15 });
    g.cyl(0.09, 0.09, 2.4, 0x2c3128, { y: 0.8, z: 1.5, rx: Math.PI / 2, seg: 6 });
    g.box(0.3, 0.14, 0.4, 0x22261f, { y: 0.8, z: 2.6 });
    this.mount.add(g.finish());
    this.object.rotation.y = this.heading;
  }

  update(dt: number): void {
    const world = this.world;
    this.tickFlash(dt);
    const target = this.pickTarget();
    const engaged = target !== null;

    // Boats never stop; they slow in the turns and while engaging.
    this.patrol(dt, engaged ? 0.5 : 1);

    if (target) {
      const want = headingTo(this.pos.x, this.pos.z, target.pos.x, target.pos.z) - this.heading;
      this.gunYaw = turnToward(this.gunYaw, want, 3.5 * dt);
      this.reload -= dt;
      if (this.reload <= 0 && this.burstLeft === 0) {
        this.burstLeft = S.burst;
        this.burstTimer = 0;
        this.reload = S.reload;
      }
    } else {
      this.gunYaw = turnToward(this.gunYaw, 0, 2 * dt);
      this.burstLeft = 0;
    }
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.burstTimer = S.burstGap;
        this.burstLeft--;
        this.fire();
      }
    }
    this.mount.rotation.y = this.gunYaw;

    // Bob on the water plane.
    this.t += dt;
    this.pos.y = 0;
    this.hull.position.y = Math.sin(this.t * 1.3) * 0.12;
    this.hull.rotation.set(Math.sin(this.t * 0.9) * 0.02, 0, Math.sin(this.t * 1.7 + 1) * 0.03);
    this.object.rotation.y = this.heading;
    this.syncObject();

    // Wake off the stern, a fractional accumulator so slow steps still foam.
    this.wakeCarry += 40 * dt;
    const n = Math.floor(this.wakeCarry);
    this.wakeCarry -= n;
    if (n > 0) world.particles.wake(this.pos.x, this.pos.z, Math.sin(this.heading), Math.cos(this.heading), S.length * 0.45, n);

    if (this.hp < this.maxHp * 0.4) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.12;
        world.particles.burningSmoke(this.pos, 1.2);
      }
    }
    world.grid.update(this);
  }

  private patrol(dt: number, speedMul: number): void {
    const pts = this.waypoints;
    if (!pts || pts.length < 2) return;
    const [tx, tz] = pts[this.wpIndex];
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    if (Math.hypot(dx, dz) < 6) {
      this.wpIndex = (this.wpIndex + 1) % pts.length;
      return;
    }
    let want = Math.atan2(dx, dz);
    // Bank avoidance: if the water 10 m ahead runs out, steer for the centreline.
    const ax = this.pos.x + Math.sin(this.heading) * 10;
    const az = this.pos.z + Math.cos(this.heading) * 10;
    const r = this.world.terrain.riverInfo(ax, az, tmpHit);
    if (Number.isFinite(r.sd)) {
      if (r.sd > -3) want = Math.atan2(r.cx - this.pos.x, r.cz - this.pos.z);
    } else {
      // Open water, no channel: read the seabed and bear away from the shoals.
      const clear = shoreAvoid(this.world.terrain, this.pos.x, this.pos.z, this.heading, 26, 2.5);
      if (clear !== null) want = clear;
    }
    const delta = angleDelta(this.heading, want);
    this.heading = turnToward(this.heading, want, S.turnRate * dt);
    const v = S.speed * speedMul * (1 - Math.min(1, Math.abs(delta) / 1.2) * 0.5);
    this.pos.x += Math.sin(this.heading) * v * dt;
    this.pos.z += Math.cos(this.heading) * v * dt;
  }

  /** The aircraft, or the nearest friendly ship, whichever is closer and in range. */
  private pickTarget(): (Entity & { vel: THREE.Vector3 }) | null {
    const world = this.world;
    let best: (Entity & { vel: THREE.Vector3 }) | null = null;
    let bestD = S.range;
    if (world.heli.alive) {
      const d = this.distanceXZ(world.heli);
      if (d < bestD) {
        bestD = d;
        best = world.heli;
      }
    }
    world.grid.query(this.pos.x, this.pos.z, S.range + 40, near, (e) => e.team === "player" && e.kind === "tanker" && e.alive);
    for (const e of near) {
      const d = this.distanceXZ(e);
      if (d < bestD) {
        bestD = d;
        best = e as Entity & { vel: THREE.Vector3 };
      }
    }
    return best;
  }

  private fire(): void {
    const world = this.world;
    const target = this.pickTarget();
    if (!target) return;
    const yaw = this.heading + this.gunYaw;
    // Keep the muzzle well above the water plane or the round dies as a splash on its first step.
    tmpMuzzle.set(
      this.pos.x + Math.sin(yaw) * 2.2 + Math.sin(this.heading) * 3,
      2.4,
      this.pos.z + Math.cos(yaw) * 2.2 + Math.cos(this.heading) * 3,
    );
    leadTarget(tmpMuzzle, target, balance.enemyShots.aa.speed, tmpDir, S.spread);
    world.fire("aa", tmpMuzzle, tmpDir, "enemy", this);
    world.particles.muzzleFlash(tmpMuzzle, tmpDir);
    world.audio.play("aa", this.pos);
  }

  protected onDeath(source?: Entity): void {
    const world = this.world;
    world.explode(this.pos, 4, 25, "neutral", 2.4, this);
    // Not spawnWreck: that snaps to the river bed. The hull sinks from the surface.
    const w = new Wreck(this.heading, 3, "boat");
    w.pos.set(this.pos.x, 0, this.pos.z);
    world.add(w);
    world.reportKill(this, source);
  }
}
