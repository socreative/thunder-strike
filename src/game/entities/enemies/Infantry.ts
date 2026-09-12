import * as THREE from "three/webgpu";
import { Entity, box } from "../Entity";
import { balance } from "../../data/balance";
import { Build } from "../../world/Detail";
import { leadTarget } from "./aim";

const S = balance.enemies.infantry;
const tmpMuzzle = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

/** Rifleman that wanders near his post and takes pot shots. */
export class Infantry extends Entity {
  private home = new THREE.Vector3();
  private wander = new THREE.Vector3();
  private reload = Math.random() * S.reload;
  private t = Math.random() * 10;
  private legs: THREE.Mesh[] = [];

  constructor() {
    super();
    this.kind = "infantry";
    this.hp = this.maxHp = S.hp;
    this.radius = S.radius;
    this.barHeight = 3.2;
    // Everything that does not move merges into one mesh. A soldier is small
    // but there are dozens of them, and each mesh is drawn again per shadow
    // cascade.
    const uniform = 0x6a5f3f;
    const b = new Build();
    b.cyl(0.42, 0.48, 1.3, uniform, { y: 1.25, seg: 8 });
    b.add(new THREE.SphereGeometry(0.34, 8, 6), 0xd9a77c, { y: 2.2 });
    b.add(new THREE.SphereGeometry(0.4, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x4a4e35, { y: 2.25 });
    b.box(0.12, 0.12, 1.4, 0x222222, { x: 0.4, y: 1.5, z: 0.5 });
    this.object.add(b.finish());
    for (const sx of [-0.22, 0.22]) {
      const leg = box(0.26, 1.0, 0.26, 0x3f4a3a, sx, 0.5, 0);
      leg.geometry.translate(0, -0.5, 0);
      leg.position.y = 1.0;
      this.legs.push(leg);
      this.object.add(leg);
    }
  }

  onSpawn(): void {
    this.home.copy(this.pos);
    this.pickWander();
  }

  private pickWander(): void {
    const a = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * 8;
    this.wander.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
  }

  update(dt: number): void {
    const world = this.world;
    this.tickFlash(dt);
    this.t += dt;
    const heli = world.heli;
    const d = heli.alive ? this.distanceXZ(heli) : Infinity;
    let moving = false;
    if (d < S.range) {
      this.object.rotation.y = Math.atan2(heli.pos.x - this.pos.x, heli.pos.z - this.pos.z);
      this.reload -= dt;
      if (this.reload <= 0) {
        this.reload = S.reload + Math.random() * 0.6;
        tmpMuzzle.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
        leadTarget(tmpMuzzle, heli, balance.enemyShots.rifle.speed, tmpDir, 0.09);
        world.fire("rifle", tmpMuzzle, tmpDir, "enemy", this);
        world.audio.play("rifle", this.pos);
      }
    } else {
      const dx = this.wander.x - this.pos.x;
      const dz = this.wander.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.4) {
        if (Math.random() < 0.01) this.pickWander();
      } else {
        moving = true;
        this.pos.x += (dx / dist) * S.speed * dt;
        this.pos.z += (dz / dist) * S.speed * dt;
        this.object.rotation.y = Math.atan2(dx, dz);
      }
    }
    const swing = moving ? Math.sin(this.t * 10) * 0.6 : 0;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.pos.y = world.terrain.heightAt(this.pos.x, this.pos.z);
    this.syncObject();
    world.grid.update(this);
  }

  protected onDeath(source?: Entity): void {
    this.world.particles.dustHit(this.pos, 1.2);
    this.world.reportKill(this, source);
  }
}
