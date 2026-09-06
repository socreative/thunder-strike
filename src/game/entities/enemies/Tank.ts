import * as THREE from "three/webgpu";
import { Entity } from "../Entity";
import { Build, PALETTE as P } from "../../world/Detail";
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
    // Procedural fallback: a proper hull with running gear, a sloped glacis
    // and a turret with mantlet and stowage.
    const w = this.light ? 3.4 : 4.4;
    const l = this.light ? 6.0 : 7.4;
    const green = this.light ? 0x7f7f5c : 0x5f6a48;
    const greenDark = this.light ? 0x63643f : 0x47512f;
    const h = new Build();
    // Lower hull and sponsons
    h.box(w, 1.0, l, greenDark, { y: 0.95 });
    h.box(w - 0.2, 0.8, l - 0.5, green, { y: 1.75 });
    // Sloped glacis at the front and a tapered rear plate
    h.box(w - 0.3, 0.22, 2.3, green, { y: 1.95, z: l * 0.32, rx: -0.55 });
    h.box(w - 0.4, 0.22, 1.4, greenDark, { y: 1.9, z: -l * 0.42, rx: 0.4 });
    // Track runs: guards, road wheels, drive sprocket and idler
    for (const sx of [-1, 1]) {
      const tx = (sx * (w + 0.9)) / 2;
      h.box(1.05, 1.0, l * 1.02, 0x2a2d26, { x: tx, y: 0.72, mat: { roughness: 0.95 } });
      h.box(1.25, 0.2, l * 1.02, greenDark, { x: tx, y: 1.35 });
      h.box(1.25, 0.5, 0.9, greenDark, { x: tx, y: 1.15, z: l * 0.44, rx: -0.5 });
      const wheels = this.light ? 4 : 5;
      for (let i = 0; i < wheels; i++) {
        const z = (i / (wheels - 1) - 0.5) * (l * 0.72);
        h.cyl(0.42, 0.42, 0.55, 0x33372e, { x: tx, y: 0.55, z, rz: Math.PI / 2, seg: 10 });
        h.cyl(0.16, 0.16, 0.6, 0x55594d, { x: tx, y: 0.55, z, rz: Math.PI / 2, seg: 6, mat: { metalness: 0.4 } });
      }
      h.cyl(0.5, 0.5, 0.58, 0x3c4036, { x: tx, y: 0.9, z: -l * 0.42, rz: Math.PI / 2, seg: 10 });
      h.cyl(0.46, 0.46, 0.58, 0x3c4036, { x: tx, y: 0.88, z: l * 0.42, rz: Math.PI / 2, seg: 10 });
      // Return rollers riding on the top run
      for (const rz of [-l * 0.2, l * 0.16]) {
        h.cyl(0.2, 0.2, 0.4, 0x33372e, { x: tx, y: 1.28, z: rz, rz: Math.PI / 2, seg: 8 });
      }
    }
    // Hull stowage: bins, spare track links, headlights, exhaust
    h.box(0.9, 0.45, 1.8, greenDark, { x: -(w / 2) - 0.1, y: 2.2, z: -1.4 });
    h.box(0.9, 0.45, 1.4, greenDark, { x: w / 2 + 0.1, y: 2.2, z: -1.8 });
    for (let i = 0; i < 4; i++) h.box(0.7, 0.14, 0.28, 0x3a3e33, { x: -(w / 2) + 0.2, y: 2.25, z: l * 0.28 - i * 0.32 });
    for (const sx of [-1, 1]) {
      h.cyl(0.2, 0.2, 0.18, 0x2a2d26, { x: sx * (w / 2 - 0.5), y: 2.25, z: l * 0.46, rx: Math.PI / 2, seg: 8 });
      h.cyl(0.15, 0.15, 0.1, 0xdcd6b4, { x: sx * (w / 2 - 0.5), y: 2.25, z: l * 0.5, rx: Math.PI / 2, seg: 8, mat: { emissive: 0x332c14 } });
    }
    h.cyl(0.22, 0.22, 1.5, 0x4a4034, { x: w / 2 + 0.15, y: 2.0, z: -l * 0.3, rz: Math.PI / 2 - 0.2, seg: 8, mat: { roughness: 0.95 } });
    this.hull.add(h.finish());

    // Turret: sloped sides, mantlet, sighted barrel, cupola and machine gun
    const t = new Build();
    const tw = w * 0.72;
    t.box(tw, 0.95, l * 0.5, green, { y: 0.5 });
    t.box(tw - 0.5, 0.35, l * 0.5, green, { y: 1.1 });
    t.box(tw, 0.5, 0.6, greenDark, { y: 0.55, z: l * 0.25, rx: -0.5 });
    t.box(tw - 0.4, 0.5, 0.7, greenDark, { y: 0.55, z: -l * 0.25, rx: 0.45 });
    // Bustle rack at the rear
    t.box(tw - 0.6, 0.5, 0.8, 0x3f4634, { y: 0.75, z: -l * 0.3 });
    // Mantlet and main gun with a thermal sleeve and muzzle brake
    const barrelLen = this.light ? 4.6 : 6.2;
    t.cyl(0.48, 0.55, 0.7, greenDark, { y: 0.55, z: l * 0.24, rx: Math.PI / 2, seg: 12 });
    t.cyl(0.19, 0.21, barrelLen * 0.55, 0x3a3e33, { y: 0.55, z: l * 0.24 + barrelLen * 0.3, rx: Math.PI / 2, seg: 10 });
    t.cyl(0.14, 0.16, barrelLen * 0.55, 0x2c3128, { y: 0.55, z: l * 0.24 + barrelLen * 0.78, rx: Math.PI / 2, seg: 8 });
    t.cyl(0.24, 0.24, 0.5, 0x22261f, { y: 0.55, z: l * 0.24 + barrelLen * 1.05, rx: Math.PI / 2, seg: 10 });
    t.box(0.55, 0.16, 0.34, 0x22261f, { y: 0.55, z: l * 0.24 + barrelLen * 1.05 });
    // Commander cupola, hatch and gunner sight
    t.cyl(0.55, 0.6, 0.42, green, { x: 0.5, y: 1.45, z: -0.3, seg: 12 });
    t.cyl(0.5, 0.5, 0.12, greenDark, { x: 0.5, y: 1.7, z: -0.3, seg: 12 });
    t.box(0.42, 0.3, 0.3, 0x2a2d26, { x: -0.75, y: 1.4, z: 0.6 });
    t.box(0.34, 0.2, 0.1, P.glass, { x: -0.75, y: 1.4, z: 0.78, mat: { roughness: 0.2, metalness: 0.4 } });
    // Roof machine gun
    t.cyl(0.09, 0.09, 1.1, 0x2a2d26, { x: 0.5, y: 1.85, z: 0.25, rx: Math.PI / 2 - 0.15, seg: 6 });
    t.box(0.16, 0.2, 0.4, 0x2a2d26, { x: 0.5, y: 1.82, z: -0.25 });
    // Smoke grenade dischargers on both cheeks
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        t.cyl(0.1, 0.1, 0.34, 0x3a3e33, { x: sx * (tw / 2 + 0.06), y: 0.8, z: 0.4 + i * 0.26, rx: Math.PI / 2 - 0.5, ry: sx * 0.3, seg: 6 });
      }
    }
    this.turret.position.set(0, 2.15, -0.3);
    this.turret.add(t.finish());
    this.barrel = this.turret;
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
