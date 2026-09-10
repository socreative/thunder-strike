import * as THREE from "three/webgpu";
import { Entity } from "../Entity";
import { balance } from "../../data/balance";
import { angleDelta, headingTo, turnToward } from "../../core/MathUtil";
import { Build, PALETTE as P } from "../../world/Detail";
import { leadTarget } from "./aim";

export type VehicleKind = "jeep" | "truck";

const tmpMuzzle = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();

/**
 * Wheeled traffic: an armed jeep that races its route and rakes the aircraft
 * with a pintle gun, or an unarmed supply truck that just drives. Both sit on
 * the terrain and lean with it like the tanks do.
 */
export class Vehicle extends Entity {
  private hull = new THREE.Group();
  private mount = new THREE.Group();
  private heading: number;
  private gunYaw = 0;
  private reload: number;
  private burstLeft = 0;
  private burstTimer = 0;
  private wpIndex = 0;
  private smokeTimer = 0;
  private readonly armed: boolean;
  private readonly speed: number;
  private readonly turnRate: number;
  private readonly length: number;

  constructor(
    readonly vehicleKind: VehicleKind,
    heading: number,
    private readonly waypoints: [number, number][] | undefined,
  ) {
    super();
    this.kind = vehicleKind;
    this.armed = vehicleKind === "jeep";
    const spec = vehicleKind === "jeep" ? balance.enemies.jeep : balance.enemies.truck;
    this.hp = this.maxHp = spec.hp;
    this.speed = spec.speed;
    this.turnRate = spec.turnRate;
    this.length = spec.length;
    this.reload = this.armed ? Math.random() * balance.enemies.jeep.reload : 0;
    this.heading = heading;
    this.barHeight = vehicleKind === "jeep" ? 3.4 : 4.6;
    this.footprint = { hx: this.length * 0.22, hz: this.length / 2 };
    this.radius = Math.hypot(this.footprint.hx, this.footprint.hz);
    this.object.add(this.hull);
    this.hull.add(this.mount);
  }

  onSpawn(): void {
    const asset = this.world.assets.get(this.vehicleKind);
    const size = this.world.assets.size(this.vehicleKind);
    if (asset && size) {
      const s = this.length / Math.max(size.x, size.z);
      asset.scale.multiplyScalar(s);
      if (size.x > size.z) asset.rotation.y += Math.PI / 2;
      this.hull.add(asset);
      this.footprint = { hx: (Math.min(size.x, size.z) * s) / 2, hz: this.length / 2 };
      this.radius = Math.hypot(this.footprint.hx, this.footprint.hz);
      this.mount.position.set(0, size.y * s * 0.9, -this.length * 0.1);
    } else if (this.vehicleKind === "jeep") {
      const b = new Build();
      b.box(1.9, 0.7, 4.2, P.olive, { y: 0.9 });
      b.box(1.7, 0.5, 1.4, P.oliveDark, { y: 1.5, z: 1.1, rx: -0.3 });
      b.box(1.8, 0.1, 1.6, P.glass, { y: 1.75, z: 0.4, rx: 0.35, mat: { roughness: 0.25, metalness: 0.35 } });
      b.box(0.12, 1.0, 0.12, P.metalDark, { x: -0.8, y: 1.8, z: -0.4 });
      b.box(0.12, 1.0, 0.12, P.metalDark, { x: 0.8, y: 1.8, z: -0.4 });
      b.box(1.8, 0.12, 0.12, P.metalDark, { y: 2.3, z: -0.4 });
      for (const sx of [-1, 1]) for (const sz of [-1.4, 1.3]) b.cyl(0.45, 0.45, 0.4, 0x22261f, { x: sx * 1.05, y: 0.45, z: sz, rz: Math.PI / 2, seg: 10 });
      this.hull.add(b.finish());
      this.mount.position.set(0, 1.5, -0.8);
    } else {
      const b = new Build();
      b.box(2.4, 0.5, 7.6, P.metalDark, { y: 0.8 });
      b.box(2.3, 1.7, 2.0, P.olive, { y: 1.9, z: 2.6 });
      b.box(2.1, 0.8, 0.14, P.glass, { y: 2.2, z: 3.6, mat: { roughness: 0.25, metalness: 0.35 } });
      b.box(2.4, 2.0, 5.0, P.oliveDark, { y: 2.05, z: -1.0 });
      b.box(2.5, 0.3, 5.1, P.olive, { y: 3.1, z: -1.0 });
      for (const sz of [-3.0, -1.6, 2.4]) for (const sx of [-1, 1]) b.cyl(0.55, 0.55, 0.5, 0x22261f, { x: sx * 1.25, y: 0.55, z: sz, rz: Math.PI / 2, seg: 10 });
      this.hull.add(b.finish());
    }
    if (this.armed) {
      const g = new Build();
      g.cyl(0.32, 0.36, 0.5, P.metalDark, { y: 0.25, seg: 8 });
      g.box(0.4, 0.3, 0.6, P.metalDark, { y: 0.6 });
      g.cyl(0.06, 0.06, 1.5, 0x2c3128, { y: 0.66, z: 0.9, rx: Math.PI / 2, seg: 6 });
      g.box(0.5, 0.35, 0.08, P.olive, { y: 0.75, z: 0.35 });
      this.mount.add(g.finish());
    }
    this.object.rotation.y = this.heading;
  }

  update(dt: number): void {
    const world = this.world;
    this.tickFlash(dt);
    const heli = world.heli;
    const d = heli.alive && this.armed ? this.distanceXZ(heli) : Infinity;
    const engaged = d < balance.enemies.jeep.range;

    // Jeeps keep moving while they shoot; trucks only drive.
    this.patrol(dt, engaged ? 0.6 : 1);

    if (this.armed) {
      const S = balance.enemies.jeep;
      if (engaged) {
        const want = headingTo(this.pos.x, this.pos.z, heli.pos.x, heli.pos.z) - this.heading;
        this.gunYaw = turnToward(this.gunYaw, want, 4 * dt);
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
    }

    this.pos.y = world.terrain.heightAt(this.pos.x, this.pos.z);
    world.terrain.normalAt(this.pos.x, this.pos.z, tmpNormal);
    this.object.rotation.set(0, this.heading, 0);
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);
    const fwdSlope = tmpNormal.x * sinH + tmpNormal.z * cosH;
    const sideSlope = tmpNormal.x * cosH - tmpNormal.z * sinH;
    this.hull.rotation.set(fwdSlope * 0.9, 0, -sideSlope * 0.9);
    this.syncObject();

    if (this.hp < this.maxHp * 0.4) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.12;
        world.particles.burningSmoke(this.pos, 1.0);
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
    if (Math.hypot(dx, dz) < 4) {
      this.wpIndex = (this.wpIndex + 1) % pts.length;
      return;
    }
    const want = Math.atan2(dx, dz);
    const delta = angleDelta(this.heading, want);
    this.heading = turnToward(this.heading, want, this.turnRate * dt);
    // Slow for the corners rather than stopping dead.
    const v = this.speed * speedMul * (1 - Math.min(1, Math.abs(delta) / 1.0) * 0.6);
    this.pos.x += Math.sin(this.heading) * v * dt;
    this.pos.z += Math.cos(this.heading) * v * dt;
  }

  private fire(): void {
    const world = this.world;
    const yaw = this.heading + this.gunYaw;
    tmpMuzzle.set(this.pos.x + Math.sin(yaw) * 1.2, this.pos.y + 2.4, this.pos.z + Math.cos(yaw) * 1.2);
    leadTarget(tmpMuzzle, world.heli, balance.enemyShots.aa.speed, tmpDir, balance.enemies.jeep.spread);
    world.fire("aa", tmpMuzzle, tmpDir, "enemy", this);
    world.particles.muzzleFlash(tmpMuzzle, tmpDir);
    world.audio.play("aa", this.pos);
  }

  protected onDeath(source?: Entity): void {
    this.world.explode(this.pos, 3, 20, "neutral", 2.2, this);
    this.world.spawnWreck(this.pos, this.heading, this.vehicleKind === "jeep" ? 1.8 : 2.6, "vehicle");
    this.world.reportKill(this, source);
  }
}
