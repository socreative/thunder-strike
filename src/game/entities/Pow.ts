import * as THREE from "three/webgpu";
import { Entity, box, cylinder, sharedMat } from "./Entity";
import type { Helicopter } from "./Helicopter";
import { balance } from "../data/balance";

/** A prisoner of war waiting to be winched aboard. */
export class Pow extends Entity {
  private t = Math.random() * 10;
  private arm: THREE.Mesh;
  private home = new THREE.Vector3();
  private wander = new THREE.Vector3();
  private baseY = 0;

  constructor() {
    super();
    this.kind = "pow";
    this.team = "neutral";
    this.targetable = false;
    this.radius = 1.2;
    const body = cylinder(0.45, 0.5, 1.4, 0xc9a86a, 0, 1.2, 0, 8);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), sharedMat(0xe0b08a));
    head.position.y = 2.25;
    head.castShadow = true;
    this.arm = box(0.22, 1.1, 0.22, 0xc9a86a, 0.55, 2.3, 0);
    this.arm.geometry.translate(0, 0.45, 0);
    this.object.add(body, head, this.arm);
    this.object.add(box(0.28, 1.0, 0.28, 0x556070, 0.22, 0.5, 0));
    this.object.add(box(0.28, 1.0, 0.28, 0x556070, -0.22, 0.5, 0));
  }

  onSpawn(): void {
    this.home.copy(this.pos);
    this.baseY = this.pos.y;
    this.pickWander();
  }

  private pickWander(): void {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 5;
    this.wander.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
  }

  update(dt: number): void {
    this.t += dt;
    const world = this.world;
    const heli = world.heli;
    const dHeli = this.distanceXZ(heli);
    if (dHeli < 40) {
      // Face the helicopter and wave.
      this.object.rotation.y = Math.atan2(heli.pos.x - this.pos.x, heli.pos.z - this.pos.z);
      this.arm.rotation.z = -2.6 + Math.sin(this.t * 9) * 0.5;
      // Run toward the aircraft if it is hovering close.
      if (dHeli > 3 && dHeli < 18 && heli.speed < 8) {
        const dx = heli.pos.x - this.pos.x;
        const dz = heli.pos.z - this.pos.z;
        const inv = 1 / Math.max(0.001, Math.hypot(dx, dz));
        this.pos.x += dx * inv * 5 * dt;
        this.pos.z += dz * inv * 5 * dt;
      }
    } else {
      this.arm.rotation.z = -0.2;
      const dx = this.wander.x - this.pos.x;
      const dz = this.wander.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) this.pickWander();
      else {
        this.pos.x += (dx / d) * 2 * dt;
        this.pos.z += (dz / d) * 2 * dt;
        this.object.rotation.y = Math.atan2(dx, dz);
      }
    }
    this.pos.y = world.terrain.heightAt(this.pos.x, this.pos.z);
    this.baseY = this.pos.y;
    this.syncObject();
    world.grid.update(this);
  }

  collect(heli: Helicopter): void {
    heli.passengers++;
    this.world.events.emit("powBoarded", {});
    this.world.audio.play("board");
    this.world.message(`POW aboard (${heli.passengers}/${balance.heli.passengersMax}). Bring them to the LZ.`);
    this.kill();
  }
}
