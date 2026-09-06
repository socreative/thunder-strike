import * as THREE from "three/webgpu";
import { Entity, box, cylinder } from "../Entity";
import { balance } from "../../data/balance";
import { headingTo, turnToward } from "../../core/MathUtil";

const S = balance.enemies.sam;
const tmpMuzzle = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

/** Surface to air missile battery with a spinning radar dish. */
export class SamSite extends Entity {
  private launcher = new THREE.Group();
  private dish = new THREE.Group();
  private yaw = Math.random() * Math.PI * 2;
  private reload = 2 + Math.random() * 2;
  private tube = 0;
  private tubes: THREE.Mesh[] = [];

  constructor() {
    super();
    this.kind = "sam";
    this.hp = this.maxHp = S.hp;
    this.radius = S.radius;
    const sand = 0x9a8a62;
    const steel = 0x555c50;
    const pale = 0xb9bfb0;
    this.object.add(cylinder(5.2, 5.5, 0.9, sand, 0, 0.45, 0, 14));
    // Launcher: a truck-like base with four tubes.
    this.object.add(box(3.2, 1.2, 5.2, steel, 0, 1.5, 0));
    // Object3D.add returns the parent, so build the wheel, lay it on its axle, then add it.
    for (const sx of [-1.4, 1.4]) {
      for (const sz of [-1.6, 1.6]) {
        const wheel = cylinder(0.6, 0.6, 0.8, 0x1c1f1a, sx, 0.9, sz, 10);
        wheel.rotation.z = Math.PI / 2;
        this.object.add(wheel);
      }
    }
    this.launcher.position.set(0, 2.4, -0.5);
    const rack = box(2.6, 0.5, 1.4, steel, 0, 0, 0);
    this.launcher.add(rack);
    for (let i = 0; i < 4; i++) {
      const sx = (i % 2 === 0 ? -1 : 1) * 0.75;
      const sy = 0.6 + Math.floor(i / 2) * 0.9;
      const t = cylinder(0.42, 0.42, 4.6, pale, sx, sy, 0.6, 10);
      t.rotation.x = Math.PI / 2 - 0.5;
      this.launcher.add(t);
      this.tubes.push(t);
    }
    this.object.add(this.launcher);
    // Radar dish on a mast.
    const mast = cylinder(0.25, 0.3, 4, steel, -3.2, 2.5, 2.4, 8);
    this.object.add(mast);
    this.dish.position.set(-3.2, 4.7, 2.4);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.4, 0.25, 12), rack.material);
    plate.rotation.x = Math.PI / 2 + 0.5;
    plate.position.z = 0.4;
    plate.castShadow = true;
    this.dish.add(plate);
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
