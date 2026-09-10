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
    this.showHealthBar = false;
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

    // Burning core, sparks and a smoke ribbon.
    this.puffTimer -= dt;
    if (this.puffTimer <= 0) {
      this.puffTimer = 0.03;
      world.particles.flareBurn(this.pos, this.vel, this.vel.lengthSq() < 0.01);
    }
  }
}
