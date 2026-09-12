import * as THREE from "three/webgpu";
import { shoreBias } from "./water";
import { Entity } from "../Entity";
import { Wreck } from "../Wreck";
import { balance } from "../../data/balance";
import { angleDelta, turnToward } from "../../core/MathUtil";
import { Build, PALETTE as P } from "../../world/Detail";
import type { RiverHit } from "../../world/Terrain";
import { Mine } from "./Mine";

export type ShipRole = "tanker" | "minelayer";

const tmpHit: RiverHit = { sd: 0, w: 0, cx: 0, cz: 0 };

/**
 * Large surface traffic. A tanker is the thing the player protects: slow,
 * friendly, and it must reach the end of its lane. A minelayer is the thing
 * that makes that hard: it crosses the lane dropping mines behind it until
 * it is sunk.
 */
export class Ship extends Entity {
  readonly vel = new THREE.Vector3();
  private hull = new THREE.Group();
  private heading: number;
  private wpIndex = 0;
  private t = Math.random() * 10;
  private wakeCarry = 0;
  private smokeTimer = 0;
  private mineTimer: number;
  private arrived = false;
  private readonly spec: { hp: number; speed: number; turnRate: number; length: number };

  constructor(
    readonly role: ShipRole,
    heading: number,
    private readonly waypoints: [number, number][] | undefined,
  ) {
    super();
    this.kind = role;
    this.spec = role === "tanker" ? balance.enemies.tanker : balance.enemies.minelayer;
    this.team = role === "tanker" ? "player" : "enemy";
    this.hp = this.maxHp = this.spec.hp;
    this.heading = heading;
    this.barHeight = role === "tanker" ? 13 : 7;
    this.footprint = { hx: this.spec.length * 0.11, hz: this.spec.length / 2 };
    this.radius = Math.hypot(this.footprint.hx, this.footprint.hz);
    this.mineTimer = 4 + Math.random() * 4;
    this.object.add(this.hull);
  }

  onSpawn(): void {
    this.pos.y = 0;
    const b = new Build();
    const L = this.spec.length;
    if (this.role === "tanker") {
      const W = L * 0.16;
      // Hull with a red boot-topping, raised bow and a bulbous stern
      b.box(W, 4.2, L * 0.86, 0x2c3238, { y: 1.6, mat: { roughness: 0.7, metalness: 0.3 } });
      b.box(W * 1.02, 0.6, L * 0.86, 0x9c2f22, { y: -0.2, mat: { roughness: 0.8 } });
      b.box(W * 0.9, 3.8, L * 0.1, 0x2c3238, { y: 1.8, z: L * 0.46, rx: 0, mat: { roughness: 0.7, metalness: 0.3 } });
      b.box(W * 0.7, 3.4, L * 0.06, 0x2c3238, { y: 1.6, z: L * 0.52, mat: { roughness: 0.7, metalness: 0.3 } });
      b.box(W * 0.9, 3.8, L * 0.1, 0x2c3238, { y: 1.8, z: -L * 0.46, mat: { roughness: 0.7, metalness: 0.3 } });
      // Deck: green with a raised catwalk, pipe runs and manifolds
      b.box(W * 0.98, 0.3, L * 0.84, 0x4d6b4a, { y: 3.85 });
      b.box(1.2, 0.5, L * 0.66, P.metal, { y: 4.35, z: L * 0.02 });
      for (const px of [-W * 0.28, W * 0.28]) {
        b.cyl(0.32, 0.32, L * 0.62, P.steel, { x: px, y: 4.4, z: L * 0.02, rx: Math.PI / 2, seg: 10, mat: { metalness: 0.5 } });
        for (let i = -3; i <= 3; i++) b.box(0.9, 1.0, 0.9, P.metalDark, { x: px, y: 4.5, z: L * 0.02 + i * L * 0.09 });
      }
      for (let i = -4; i <= 4; i++) b.cyl(0.9, 0.9, 0.5, P.metalDark, { x: 0, y: 4.25, z: i * L * 0.085, seg: 12 });
      // Aft superstructure, bridge, funnel and mast
      b.box(W * 0.8, 5.5, L * 0.13, P.white, { y: 6.6, z: -L * 0.36, mat: { roughness: 0.6 } });
      b.box(W * 0.86, 2.6, L * 0.06, P.white, { y: 10.3, z: -L * 0.33, mat: { roughness: 0.6 } });
      b.box(W * 0.84, 0.8, L * 0.056, P.glass, { y: 10.4, z: -L * 0.30, mat: { roughness: 0.25, metalness: 0.35 } });
      b.cyl(1.1, 1.3, 4.2, 0x2c3238, { y: 12.4, z: -L * 0.42, seg: 12 });
      b.cyl(0.9, 0.9, 0.6, P.hazard, { y: 14.6, z: -L * 0.42, seg: 12 });
      b.latticeMast(5, 0.9, P.steel, { y: 11.6, z: -L * 0.35 });
      // Bow mast and anchor gear
      b.cyl(0.12, 0.14, 5, P.steel, { y: 6.4, z: L * 0.44, seg: 6 });
      b.box(2.2, 0.8, 1.6, P.metalDark, { y: 4.4, z: L * 0.42 });
      // Lifeboats hung off the superstructure
      for (const sx of [-1, 1]) b.box(1.2, 1.0, 3.6, P.hazard, { x: sx * W * 0.47, y: 8.2, z: -L * 0.36 });
    } else {
      const W = L * 0.2;
      b.box(W, 3.0, L * 0.9, 0x3a4048, { y: 1.1, mat: { roughness: 0.7, metalness: 0.3 } });
      b.box(W * 0.8, 2.6, L * 0.1, 0x3a4048, { y: 1.2, z: L * 0.48, mat: { roughness: 0.7, metalness: 0.3 } });
      b.box(W * 1.02, 0.5, L * 0.9, 0x1e2226, { y: -0.3, mat: { roughness: 0.8 } });
      b.box(W * 0.98, 0.3, L * 0.88, P.metalDark, { y: 2.65 });
      // Bridge forward, open mine deck aft with two rails and racked mines
      b.box(W * 0.8, 2.6, L * 0.18, P.olive, { y: 4.1, z: L * 0.2 });
      b.box(W * 0.84, 0.7, L * 0.17, P.glass, { y: 4.7, z: L * 0.2, mat: { roughness: 0.25, metalness: 0.35 } });
      b.box(W * 0.6, 0.3, L * 0.12, P.oliveDark, { y: 5.5, z: L * 0.2 });
      b.cyl(0.08, 0.08, 4, P.steel, { y: 7.2, z: L * 0.14, seg: 5 });
      for (const sx of [-W * 0.3, W * 0.3]) {
        b.box(0.25, 0.25, L * 0.5, P.steel, { x: sx, y: 3.0, z: -L * 0.18, mat: { metalness: 0.5 } });
        for (let i = 0; i < 5; i++) b.sphere(0.75, 0x23262a, { x: sx, y: 3.6, z: -L * 0.38 + i * L * 0.09, mat: { roughness: 0.6, metalness: 0.4 } });
      }
      // Stern ramp the mines roll off
      b.box(W * 0.7, 0.2, L * 0.12, P.metalDark, { y: 2.6, z: -L * 0.47, rx: 0.35 });
      b.railing(L * 0.5, 0.9, P.steel, { x: W * 0.48, y: 2.8, z: -L * 0.18, ry: Math.PI / 2 });
      b.railing(L * 0.5, 0.9, P.steel, { x: -W * 0.48, y: 2.8, z: -L * 0.18, ry: Math.PI / 2 });
    }
    this.hull.add(b.finish());
    this.object.rotation.y = this.heading;
  }

  update(dt: number): void {
    const world = this.world;
    this.tickFlash(dt);
    const before = this.pos.clone();
    this.sail(dt);
    this.vel.copy(this.pos).sub(before).divideScalar(Math.max(dt, 1e-4));

    this.t += dt;
    this.pos.y = 0;
    this.hull.position.y = Math.sin(this.t * 0.6) * 0.15;
    this.hull.rotation.set(Math.sin(this.t * 0.45) * 0.01, 0, Math.sin(this.t * 0.7 + 1) * 0.015);
    this.object.rotation.y = this.heading;
    this.syncObject();

    const stern = this.spec.length * 0.5;
    this.wakeCarry += (this.role === "tanker" ? 30 : 36) * dt;
    const n = Math.floor(this.wakeCarry);
    this.wakeCarry -= n;
    if (n > 0) world.particles.wake(this.pos.x, this.pos.z, Math.sin(this.heading), Math.cos(this.heading), stern, n);

    if (this.role === "minelayer") {
      this.mineTimer -= dt;
      if (this.mineTimer <= 0) {
        this.mineTimer = balance.enemies.minelayer.mineEvery;
        const m = new Mine();
        m.pos.set(this.pos.x - Math.sin(this.heading) * (stern + 4), 0.3, this.pos.z - Math.cos(this.heading) * (stern + 4));
        world.add(m);
        world.particles.splash(m.pos, 1.2);
      }
    }

    if (this.hp < this.maxHp * 0.5) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.1;
        const p = this.pos.clone();
        p.y += this.role === "tanker" ? 5 : 3;
        p.z += 0;
        world.particles.burningSmoke(p, this.role === "tanker" ? 2.2 : 1.4);
      }
    }
    world.grid.update(this);

    // A tanker that has cleared the lane steams off the map and is done with.
    if (this.arrived && (Math.abs(this.pos.x) > world.terrain.size / 2 + 40 || Math.abs(this.pos.z) > world.terrain.size / 2 + 40)) {
      this.alive = false;
      world.remove(this);
    }
  }

  private sail(dt: number): void {
    const pts = this.waypoints;
    let want = this.heading;
    let speedMul = 1;
    if (pts && pts.length > 0 && !this.arrived) {
      this.wpIndex = Math.min(this.wpIndex, pts.length - 1);
      const [tx, tz] = pts[this.wpIndex];
      const dx = tx - this.pos.x;
      const dz = tz - this.pos.z;
      if (Math.hypot(dx, dz) < 12) {
        if (this.wpIndex === pts.length - 1) {
          if (this.role === "tanker") {
            this.arrived = true;
            this.world.events.emit("arrived", { entity: this });
            this.world.message("A tanker has cleared the strait.");
          } else this.wpIndex = 0;
        } else this.wpIndex++;
      } else want = Math.atan2(dx, dz);
    }
    if (this.role === "minelayer") {
      // Keep off the shore: if the water runs out ahead, steer for the channel centre.
      const ax = this.pos.x + Math.sin(this.heading) * 25;
      const az = this.pos.z + Math.cos(this.heading) * 25;
      const r = this.world.terrain.riverInfo(ax, az, tmpHit);
      if (Number.isFinite(r.sd)) {
        if (r.sd > -8) want = Math.atan2(r.cx - this.pos.x, r.cz - this.pos.z);
      } else {
        want += shoreBias(this.world.terrain, this.pos.x, this.pos.z, this.heading, 34, 3);
      }
    }
    const delta = angleDelta(this.heading, want);
    this.heading = turnToward(this.heading, want, this.spec.turnRate * dt);
    if (this.role === "minelayer") speedMul = 1 - Math.min(1, Math.abs(delta) / 1.2) * 0.5;
    const v = this.spec.speed * speedMul;
    this.pos.x += Math.sin(this.heading) * v * dt;
    this.pos.z += Math.cos(this.heading) * v * dt;
  }

  protected onDeath(source?: Entity): void {
    const world = this.world;
    const big = this.role === "tanker";
    world.explode(this.pos, big ? 9 : 5, big ? 60 : 30, "neutral", big ? 4.6 : 3.0, this);
    if (big) {
      // Cargo goes up along the length of the hull.
      for (let i = 0; i < 4; i++) {
        const p = this.pos.clone();
        p.x += Math.sin(this.heading) * (-20 + i * 13);
        p.z += Math.cos(this.heading) * (-20 + i * 13);
        p.y += 3;
        world.later(0.2 + i * 0.3, () => world.explode(p, 6, 30, "neutral", 3.4, this));
      }
      for (let i = 0; i < 90; i++) world.later(0.6 + i * 0.3, () => world.particles.burningSmoke(this.pos, 3.2));
      world.shake(3);
      world.message("Tanker lost.");
      world.events.emit("escortLost", { entity: this });
    }
    const w = new Wreck(this.heading, big ? 9 : 4.5, "boat");
    w.pos.set(this.pos.x, 0, this.pos.z);
    world.add(w);
    world.reportKill(this, source);
  }
}
