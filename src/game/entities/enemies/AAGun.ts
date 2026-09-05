import * as THREE from "three/webgpu";
import { Entity, box, cylinder } from "../Entity";
import { balance } from "../../data/balance";
import { headingTo, turnToward } from "../../core/MathUtil";
import { leadTarget } from "./aim";

const S = balance.enemies.aa;
const tmpMuzzle = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

/** Static anti-aircraft cannon firing short bursts. */
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
    this.radius = S.radius;
    const sand = 0x9a8a62;
    const steel = 0x4b5048;
    // Sandbag ring and base
    this.object.add(cylinder(3.4, 3.6, 1.0, sand, 0, 0.5, 0, 12));
    this.object.add(cylinder(1.4, 1.6, 0.8, steel, 0, 1.4, 0, 10));
    this.turret.position.y = 1.9;
    this.turret.add(box(2.0, 1.0, 2.2, steel, 0, 0.4, 0));
    this.barrels.position.set(0, 0.7, 0.6);
    for (const sx of [-0.45, 0.45]) {
      const b = cylinder(0.12, 0.14, 3.6, 0x22261f, sx, 0, 1.8, 6);
      b.rotation.x = Math.PI / 2;
      this.barrels.add(b);
    }
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
