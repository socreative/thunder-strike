import * as THREE from "three/webgpu";
import { Entity } from "./Entity";
import { balance } from "../data/balance";

/** A burning decoy dropped by the helicopter. Missiles that take the bait chase it instead. */
export class Flare extends Entity {
  readonly vel = new THREE.Vector3();
  private life = balance.heli.flareLife;
  private puffTimer = 0;

  constructor(pos: THREE.Vector3, vel: THREE.Vector3) {
    super();
    this.kind = "flare";
    this.team = "player";
    this.targetable = false;
    this.blip = false;
    this.radius = 2.5;
    this.pos.copy(pos);
    this.vel.copy(vel);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicNodeMaterial({ color: 0xfff3c0 }));
    this.object.add(core);
    this.syncObject();
  }

  update(dt: number): void {
    const world = this.world;
    this.life -= dt;
    if (this.life <= 0) {
      this.kill();
      return;
    }
    this.vel.y -= 9 * dt;
    this.vel.multiplyScalar(Math.max(0, 1 - 1.4 * dt));
    this.pos.addScaledVector(this.vel, dt);
    const ground = Math.max(world.terrain.heightAt(this.pos.x, this.pos.z), 0);
    if (this.pos.y < ground + 0.4) {
      this.pos.y = ground + 0.4;
      this.vel.set(0, 0, 0);
    }
    this.syncObject();
    world.grid.update(this);

    // Bright core with a white smoke tail.
    this.puffTimer -= dt;
    if (this.puffTimer <= 0) {
      this.puffTimer = 0.025;
      world.particles.fire.spawn({
        x: this.pos.x,
        y: this.pos.y,
        z: this.pos.z,
        vx: (Math.random() - 0.5) * 3,
        vy: 1 + Math.random() * 2,
        vz: (Math.random() - 0.5) * 3,
        life: 0.25,
        size: 2.6,
        sizeEnd: 0.8,
        color: 0xfff6d0,
        colorEnd: 0xffa030,
        alpha: 1,
      });
      world.particles.smoke.spawn({
        x: this.pos.x,
        y: this.pos.y,
        z: this.pos.z,
        vx: (Math.random() - 0.5) * 2,
        vy: 1.5,
        vz: (Math.random() - 0.5) * 2,
        life: 1.4,
        size: 1.2,
        sizeEnd: 3.5,
        color: 0xf0f0f0,
        colorEnd: 0xbdbdbd,
        alpha: 0.6,
        drag: 1.2,
      });
    }
  }
}
