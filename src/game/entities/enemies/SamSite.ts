import * as THREE from "three/webgpu";
import { Entity } from "../Entity";
import { balance } from "../../data/balance";
import { headingTo, turnToward } from "../../core/MathUtil";
import { Build, PALETTE as P } from "../../world/Detail";

const S = balance.enemies.sam;
const tmpMuzzle = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

/** Surface to air missile battery: a launch vehicle beside a tracking radar. */
export class SamSite extends Entity {
  private launcher = new THREE.Group();
  private dish = new THREE.Group();
  private yaw = Math.random() * Math.PI * 2;
  private reload = 2 + Math.random() * 2;
  private tube = 0;
  private tubes: THREE.Object3D[] = [];

  constructor() {
    super();
    this.kind = "sam";
    this.hp = this.maxHp = S.hp;
    // Cover the revetment pad, not just the launcher.
    this.radius = 5.8;
    this.barHeight = 7.5;

    // Revetment: graded pad, sandbag horseshoe open to the front, cable ducts
    const g = new Build();
    g.cyl(5.6, 5.9, 0.45, 0x8f8362, { y: 0.22, seg: 18, mat: { roughness: 1 } });
    g.cyl(6.2, 6.4, 0.28, 0x9a8d68, { y: 0.14, seg: 18, mat: { roughness: 1, flat: true } });
    g.sandbagRing(5.6, 2, P.sandbag, { y: 0.45, arc: Math.PI * 1.25, start: Math.PI * 0.62, seed: 13 });
    g.box(1.2, 0.25, 4.0, P.metalDark, { x: -3.4, y: 0.5, z: 1.6, ry: 0.3 });

    // Launch vehicle: chassis, cab, outriggers and road wheels
    g.box(3.4, 0.9, 8.2, P.oliveDark, { y: 1.15 });
    g.box(3.1, 0.45, 8.4, P.metalDark, { y: 0.72 });
    g.box(2.9, 1.7, 2.4, P.olive, { y: 2.3, z: 2.7 });
    g.box(2.6, 0.7, 0.22, P.glass, { y: 2.7, z: 3.92, mat: { roughness: 0.25, metalness: 0.35 } });
    g.box(2.95, 0.28, 2.5, P.oliveDark, { y: 3.2, z: 2.7 });
    g.box(0.35, 0.4, 0.5, P.metalDark, { x: 1.6, y: 2.95, z: 3.7 });
    for (const sz of [-3.0, -1.2, 0.6]) {
      for (const sx of [-1.75, 1.75]) {
        g.cyl(0.62, 0.62, 0.52, 0x1f231c, { x: sx, y: 0.62, z: sz, rz: Math.PI / 2, seg: 12, mat: { roughness: 0.95 } });
        g.cyl(0.28, 0.28, 0.56, P.steel, { x: sx, y: 0.62, z: sz, rz: Math.PI / 2, seg: 8, mat: { metalness: 0.5 } });
      }
    }
    // Hydraulic outriggers holding the launcher steady
    for (const sx of [-1, 1]) {
      for (const sz of [-2.6, 1.4]) {
        g.cyl(0.16, 0.16, 1.4, P.steel, { x: sx * 2.1, y: 0.9, z: sz, rz: sx * 0.5, seg: 6, mat: { metalness: 0.55 } });
        g.cyl(0.42, 0.42, 0.18, P.metalDark, { x: sx * 2.5, y: 0.12, z: sz, seg: 10 });
      }
    }
    // Tracking radar on a short mast beside the vehicle
    g.box(2.2, 1.0, 2.2, P.oliveDark, { x: -4.2, y: 0.85, z: 2.6 });
    g.latticeMast(3.4, 1.0, P.steel, { x: -4.2, y: 1.35, z: 2.6 });
    this.object.add(g.finish());

    // Rotating launcher rack with four canisters
    const r = new Build();
    r.cyl(1.15, 1.3, 0.45, P.metalDark, { y: 0.22, seg: 14, mat: { metalness: 0.45 } });
    r.box(2.9, 0.6, 1.6, P.oliveDark, { y: 0.72 });
    // Elevating arms
    for (const sx of [-1.2, 1.2]) r.box(0.3, 1.1, 0.5, P.metalDark, { x: sx, y: 1.2, z: -0.3 });
    const elev = Math.PI / 2 - 0.62;
    for (let i = 0; i < 4; i++) {
      const sx = (i % 2 === 0 ? -1 : 1) * 0.8;
      const sy = 1.35 + Math.floor(i / 2) * 0.95;
      const sz = 0.55;
      // Canister with rails, end cap and a red band
      r.box(0.86, 0.86, 4.8, 0xcdc9ba, { x: sx, y: sy, z: sz, rx: elev, mat: { roughness: 0.55 } });
      r.box(0.94, 0.16, 4.8, P.metalDark, { x: sx, y: sy, z: sz, rx: elev });
      r.box(0.16, 0.94, 4.8, P.metalDark, { x: sx, y: sy, z: sz, rx: elev });
      const capOff = 2.5;
      r.cone(0.5, 0.7, P.hazard, {
        x: sx,
        y: sy + Math.sin(elev) * capOff,
        z: sz + Math.cos(elev) * capOff,
        rx: elev,
        seg: 8,
      });
      const tube = new THREE.Object3D();
      tube.position.set(sx, sy + Math.sin(elev) * capOff, sz + Math.cos(elev) * capOff);
      this.tubes.push(tube);
      this.launcher.add(tube);
    }
    r.box(3.2, 0.22, 0.5, P.metalDark, { y: 2.55, z: -1.2 });
    this.launcher.position.set(0, 1.6, -1.4);
    this.launcher.add(r.finish());
    this.object.add(this.launcher);

    // Radar dish that sweeps continuously
    const d = new Build();
    d.cyl(0.4, 0.5, 0.5, P.metalDark, { y: 0.25, seg: 10 });
    d.box(0.9, 0.35, 0.6, P.metal, { y: 0.6 });
    const tilt = -0.5;
    d.bowl(1.7, P.white, Math.PI / 3, { y: 1.0, rx: Math.PI + tilt, seg: 14, mat: { roughness: 0.45, metalness: 0.2 } });
    d.torus(1.68, 0.06, P.steel, { y: 1.0, rx: Math.PI / 2 + tilt, seg: 16, mat: { metalness: 0.5 } });
    const focus = new THREE.Vector3(-Math.sin(tilt) * 1.3, 1.0 + Math.cos(tilt) * 1.3, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      d.strut(new THREE.Vector3(Math.cos(a) * 1.3, 1.0, Math.sin(a) * 1.3), focus, 0.04, P.steel, { metalness: 0.5 }, 4);
    }
    d.cyl(0.1, 0.2, 0.4, P.metalDark, { x: focus.x, y: focus.y, z: focus.z, rx: tilt, seg: 6 });
    this.dish.position.set(-4.2, 4.75, 2.6);
    this.dish.add(d.finish());
    this.object.add(this.dish);
  }

  update(dt: number): void {
    const world = this.world;
    this.tickFlash(dt);
    this.dish.rotation.y += 2.4 * dt;
    const heli = world.heli;
    const d = heli.alive ? this.distanceXZ(heli) : Infinity;
    if (d < S.range) {
      const want = headingTo(this.pos.x, this.pos.z, heli.pos.x, heli.pos.z);
      this.yaw = turnToward(this.yaw, want, 1.6 * dt);
      this.reload -= dt;
      if (this.reload <= 0 && d > S.minRange) {
        this.reload = S.reload;
        this.fire();
      }
    }
    this.launcher.rotation.y = this.yaw;
    this.syncObject();
  }

  private fire(): void {
    const world = this.world;
    const tube = this.tubes[this.tube % this.tubes.length];
    this.tube++;
    tube.getWorldPosition(tmpMuzzle);
    tmpDir.set(Math.sin(this.yaw), 1.4, Math.cos(this.yaw)).normalize();
    tmpMuzzle.addScaledVector(tmpDir, 2.5);
    world.fire("sam", tmpMuzzle, tmpDir, "enemy", this, world.heli);
    world.particles.explosion(tmpMuzzle, 0.8);
    world.events.emit("samLaunch", {});
    world.audio.play("samLaunch", this.pos);
    world.message("Missile launch detected. Break and shoot it down.");
  }

  protected onDeath(source?: Entity): void {
    this.world.explode(this.pos, 6, 60, "neutral", 3.0, this);
    this.world.spawnWreck(this.pos, this.yaw, 3, "emplacement");
    this.world.reportKill(this, source);
  }
}
