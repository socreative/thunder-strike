import * as THREE from "three/webgpu";
import { Entity, box, cylinder } from "../Entity";
import { balance } from "../../data/balance";
import { angleDelta, headingTo, turnToward } from "../../core/MathUtil";
import { leadTarget } from "./aim";

const tmpMuzzle = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();

/** Main battle tank or light tank: patrols waypoints and shells the helicopter. */
export class Tank extends Entity {
  private turret = new THREE.Group();
  private barrel!: THREE.Object3D;
  private heading: number;
  private turretYaw = 0;
  private reload: number;
  private wpIndex = 0;
  private smokeTimer = 0;
  private spec: (typeof balance.enemies)["tank"];
  private hull = new THREE.Group();
  private hullAims = false;

  constructor(
    readonly light: boolean,
    heading: number,
    private waypoints: [number, number][] | undefined,
  ) {
    super();
    this.kind = light ? "lightTank" : "tank";
    this.spec = light ? balance.enemies.lightTank : balance.enemies.tank;
    this.hp = this.maxHp = this.spec.hp;
    this.radius = this.spec.radius;
    this.heading = heading;
    this.reload = this.spec.reload * Math.random();
    this.object.add(this.hull);
    this.hull.add(this.turret);
  }

  onSpawn(): void {
    const asset = this.world.assets.get(this.light ? "lightTank" : "tank");
    const scale = this.light ? 6.5 : 8;
    if (asset) {
      const size = this.world.assets.size(this.light ? "lightTank" : "tank")!;
      asset.scale.multiplyScalar(scale / Math.max(size.x, size.z));
      if (size.x > size.z) asset.rotation.y += Math.PI / 2;
      this.hull.add(asset);
      // Turret from the model, if it is a named node; otherwise we add our own barrel.
      let turret: THREE.Object3D | null = null;
      asset.traverse((o) => {
        const n = o.name.toLowerCase();
        if (!turret && (n.includes("turret") || n.includes("gun"))) turret = o;
      });
      if (turret) {
        this.turret = turret;
        this.barrel = turret;
      } else {
        // Single-mesh model: the whole hull turns toward the target instead.
        this.barrel = this.turret;
        this.hullAims = true;
      }
      return;
    }
    const green = this.light ? 0x7a7c5a : 0x5c6b4a;
    const dark = 0x2c3128;
    const w = this.light ? 3.2 : 4.2;
    const l = this.light ? 5.4 : 7;
    this.hull.add(box(w, 1.3, l, green, 0, 1.0, 0));
    this.hull.add(box(w * 0.7, 0.4, l * 0.8, green, 0, 1.85, -0.3));
    for (const sx of [-1, 1]) {
      this.hull.add(box(1.1, 1.2, l * 1.02, dark, (sx * (w + 1.0)) / 2, 0.7, 0));
    }
    this.turret.position.set(0, 2.1, -0.4);
    this.turret.add(box(w * 0.6, 1.0, l * 0.45, green, 0, 0.4, 0));
    this.turret.add(cylinder(0.9, 1.1, 0.7, green, 0, 0.9, -0.3, 10));
    const barrelLen = this.light ? 4.5 : 6;
    const barrel = cylinder(0.18, 0.22, barrelLen, dark, 0, 0.5, l * 0.22 + barrelLen / 2, 8);
    barrel.rotation.x = Math.PI / 2;
    this.turret.add(barrel);
    this.barrel = barrel;
  }

  update(dt: number): void {
    const world = this.world;
    this.tickFlash(dt);
    const heli = world.heli;
    const d = heli.alive ? this.distanceXZ(heli) : Infinity;
    const engaged = d < this.spec.range;

    if (engaged) {
      const wantAbs = headingTo(this.pos.x, this.pos.z, heli.pos.x, heli.pos.z);
      if (this.hullAims) {
        this.heading = turnToward(this.heading, wantAbs, this.spec.turretRate * dt);
        this.turretYaw = 0;
      } else {
        this.turretYaw = turnToward(this.turretYaw, wantAbs - this.heading, this.spec.turretRate * dt);
      }
      const aimed = this.hullAims ? angleDelta(this.heading, wantAbs) : angleDelta(this.turretYaw, wantAbs - this.heading);
      this.reload -= dt;
      if (this.reload <= 0 && Math.abs(aimed) < 0.12) {
        this.reload = this.spec.reload;
        this.fire();
      }
    } else {
      this.turretYaw = turnToward(this.turretYaw, 0, this.spec.turretRate * dt);
      this.reload = Math.min(this.reload, 1.5);
      this.patrol(dt);
    }
    this.turret.rotation.y = this.turretYaw;

    this.pos.y = world.terrain.heightAt(this.pos.x, this.pos.z);
    world.terrain.normalAt(this.pos.x, this.pos.z, tmpNormal);
    this.object.rotation.set(0, this.heading, 0);
    // Tilt hull to the slope.
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
        world.particles.burningSmoke(this.pos, 1.2);
      }
    }
    world.grid.update(this);
  }

  private patrol(dt: number): void {
    if (!this.waypoints || this.waypoints.length < 2) return;
    const [tx, tz] = this.waypoints[this.wpIndex];
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 3) {
      this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
      return;
    }
    const want = Math.atan2(dx, dz);
    this.heading = turnToward(this.heading, want, 1.2 * dt);
    if (Math.abs(angleDelta(this.heading, want)) < 0.5) {
      this.pos.x += Math.sin(this.heading) * this.spec.speed * dt;
      this.pos.z += Math.cos(this.heading) * this.spec.speed * dt;
    }
  }

  private fire(): void {
    const world = this.world;
    const yaw = this.heading + this.turretYaw;
    tmpMuzzle.set(this.pos.x + Math.sin(yaw) * 5, this.pos.y + 2.6, this.pos.z + Math.cos(yaw) * 5);
    leadTarget(tmpMuzzle, world.heli, balance.enemyShots.shell.speed, tmpDir, 0.03);
    world.fire("shell", tmpMuzzle, tmpDir, "enemy", this);
    world.particles.muzzleFlash(tmpMuzzle, tmpDir);
    world.particles.dustHit(this.pos, 1.5);
    world.audio.play("cannon", this.pos);
  }

  protected onDeath(source?: Entity): void {
    this.world.explode(this.pos, 4, 30, "neutral", 2.6, this);
    this.world.spawnWreck(this.pos, this.heading, this.light ? 2.2 : 3, "vehicle");
    this.world.reportKill(this, source);
  }
}
