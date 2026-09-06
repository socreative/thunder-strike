import * as THREE from "three/webgpu";
import { Entity } from "../Entity";
import { balance } from "../../data/balance";
import { headingTo, turnToward } from "../../core/MathUtil";
import { Build, PALETTE as P } from "../../world/Detail";
import { leadTarget } from "./aim";

const S = balance.enemies.aa;
const tmpMuzzle = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

/** Twin-barrel anti-aircraft cannon in a sandbagged emplacement. */
export class AAGun extends Entity {
  private turret = new THREE.Group();
  private barrels = new THREE.Group();
  private yaw = Math.random() * Math.PI * 2;
  private pitch = 0;
  private reload = Math.random() * S.reload;
  private burstLeft = 0;
  private burstTimer = 0;
  private side = 1;

  constructor() {
    super();
    this.kind = "aa";
    this.hp = this.maxHp = S.hp;
    // The sandbag emplacement reads wider than the gun itself.
    this.radius = 3.9;
    this.barHeight = 5.4;

    // Emplacement: dug-in floor, two courses of sandbags with a rear gap for
    // the crew, spare ammunition boxes and a jerrycan.
    const g = new Build();
    g.cyl(3.5, 3.7, 0.5, 0x8f8362, { y: 0.25, seg: 16, mat: { roughness: 1 } });
    g.cyl(3.9, 4.1, 0.3, 0x9a8d68, { y: 0.15, seg: 16, mat: { roughness: 1, flat: true } });
    g.sandbagRing(3.5, 2, P.sandbag, { y: 0.5, arc: Math.PI * 1.72, start: Math.PI * 0.14, seed: 5 });
    g.sandbagRing(3.5, 1, P.sandbagDark, { y: 1.42, arc: Math.PI * 1.2, start: Math.PI * 0.4, seed: 9 });
    for (const [bx, bz, br] of [
      [2.1, 2.0, 0.4],
      [2.6, 1.4, -0.2],
    ] as [number, number, number][]) {
      g.box(0.95, 0.5, 0.6, P.oliveDark, { x: bx, y: 0.75, z: bz, ry: br });
      g.box(0.99, 0.09, 0.16, 0x2b2f26, { x: bx, y: 1.0, z: bz, ry: br });
    }
    g.box(0.42, 0.62, 0.28, P.olive, { x: -2.3, y: 0.81, z: 1.9, ry: -0.5 });
    this.object.add(g.finish());

    // Pedestal and traversing ring
    const base = new Build();
    base.cyl(1.05, 1.35, 0.7, P.metalDark, { y: 0.85, seg: 12, mat: { metalness: 0.4 } });
    base.cyl(1.15, 1.15, 0.22, P.steel, { y: 1.28, seg: 14, mat: { metalness: 0.55 } });
    this.object.add(base.finish());

    // Rotating carriage: shield, cradle, seats, ammo drums
    const t = new Build();
    t.cyl(1.0, 1.0, 0.35, P.metal, { y: 0.18, seg: 12, mat: { metalness: 0.45 } });
    t.box(1.9, 0.55, 1.7, P.olive, { y: 0.6 });
    // Angled gun shield, front plus two folded cheeks
    t.box(2.5, 1.5, 0.16, P.olive, { y: 1.2, z: 1.0, rx: -0.22 });
    t.box(0.16, 1.35, 0.8, P.olive, { x: 1.2, y: 1.15, z: 0.62, ry: 0.42 });
    t.box(0.16, 1.35, 0.8, P.olive, { x: -1.2, y: 1.15, z: 0.62, ry: -0.42 });
    t.box(2.5, 0.14, 0.24, P.oliveDark, { y: 1.94, z: 0.96, rx: -0.22 });
    // Gunner seats and elevation handwheels
    for (const sx of [-0.85, 0.85]) {
      t.box(0.5, 0.1, 0.5, P.metalDark, { x: sx, y: 0.95, z: -0.75 });
      t.box(0.5, 0.5, 0.1, P.metalDark, { x: sx, y: 1.2, z: -0.98 });
      t.torus(0.24, 0.05, P.metalDark, { x: sx * 1.05, y: 1.05, z: -0.1, ry: Math.PI / 2, seg: 10 });
    }
    // Trunnion arms the barrels pivot in
    for (const sx of [-0.62, 0.62]) t.box(0.22, 0.85, 0.3, P.metalDark, { x: sx, y: 1.15, z: 0.1 });
    this.turret.position.y = 1.35;
    this.turret.add(t.finish());

    // Barrel cradle: twin autocannons with jackets, muzzle brakes and feed drums
    const bar = new Build();
    bar.box(1.5, 0.5, 1.1, P.metalDark, { z: -0.1, mat: { metalness: 0.4 } });
    for (const sx of [-0.42, 0.42]) {
      bar.cyl(0.2, 0.22, 1.3, P.metalDark, { x: sx, z: 0.55, rx: Math.PI / 2, seg: 8, mat: { metalness: 0.45 } });
      // Perforated cooling jacket
      bar.cyl(0.155, 0.155, 2.6, 0x35392f, { x: sx, z: 2.1, rx: Math.PI / 2, seg: 8, mat: { metalness: 0.4 } });
      for (let i = 0; i < 6; i++) {
        bar.cyl(0.175, 0.175, 0.1, 0x22261f, { x: sx, z: 1.1 + i * 0.4, rx: Math.PI / 2, seg: 8 });
      }
      bar.cyl(0.105, 0.105, 1.5, 0x22261f, { x: sx, z: 4.05, rx: Math.PI / 2, seg: 6, mat: { metalness: 0.5 } });
      // Muzzle brake
      bar.cyl(0.18, 0.18, 0.42, 0x2c3128, { x: sx, z: 4.85, rx: Math.PI / 2, seg: 8, mat: { metalness: 0.5 } });
      bar.box(0.4, 0.1, 0.28, 0x22261f, { x: sx, z: 4.85 });
      // Ammunition drum feeding from outboard
      bar.cyl(0.42, 0.42, 0.3, P.oliveDark, { x: sx * 1.9, y: 0.05, z: -0.15, rz: Math.PI / 2, seg: 12 });
    }
    // Spent-case chute and recoil springs
    bar.box(0.5, 0.28, 0.9, P.metalDark, { y: -0.35, z: 0.2 });
    for (const sx of [-0.42, 0.42]) bar.cyl(0.07, 0.07, 1.0, P.steel, { x: sx, y: 0.26, z: 0.6, rx: Math.PI / 2, seg: 5, mat: { metalness: 0.6 } });
    this.barrels.position.set(0, 0.75, 0.2);
    this.barrels.add(bar.finish());
    this.turret.add(this.barrels);
    this.object.add(this.turret);
  }

  update(dt: number): void {
    const world = this.world;
    this.tickFlash(dt);
    const heli = world.heli;
    const d = heli.alive ? this.distanceXZ(heli) : Infinity;
    if (d < S.range) {
      const want = headingTo(this.pos.x, this.pos.z, heli.pos.x, heli.pos.z);
      this.yaw = turnToward(this.yaw, want, 3.5 * dt);
      const dy = heli.pos.y - (this.pos.y + 2.6);
      this.pitch = turnToward(this.pitch, -Math.atan2(dy, d), 3 * dt);
      this.reload -= dt;
      if (this.reload <= 0 && this.burstLeft === 0) {
        this.burstLeft = S.burst;
        this.burstTimer = 0;
        this.reload = S.reload;
      }
    } else {
      this.pitch = turnToward(this.pitch, -0.3, 2 * dt);
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
    this.turret.rotation.y = this.yaw;
    this.barrels.rotation.x = this.pitch;
    this.syncObject();
  }

  private fire(): void {
    const world = this.world;
    this.side = -this.side;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    tmpMuzzle.set(this.pos.x + fx * 3.5 + fz * 0.45 * this.side, this.pos.y + 2.7, this.pos.z + fz * 3.5 - fx * 0.45 * this.side);
    leadTarget(tmpMuzzle, world.heli, balance.enemyShots.aa.speed, tmpDir, S.spread);
    world.fire("aa", tmpMuzzle, tmpDir, "enemy", this);
    world.particles.muzzleFlash(tmpMuzzle, tmpDir);
    world.audio.play("aa", this.pos);
  }

  protected onDeath(source?: Entity): void {
    this.world.explode(this.pos, 3, 20, "neutral", 2.0, this);
    this.world.spawnWreck(this.pos, this.yaw, 2, "emplacement");
    this.world.reportKill(this, source);
  }
}
