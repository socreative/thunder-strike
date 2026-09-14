import * as THREE from "three/webgpu";
import { Entity } from "../Entity";
import { balance } from "../../data/balance";
import { Build, PALETTE as P } from "../../world/Detail";
import { Zombie } from "./Zombie";

const S = balance.enemies.crypt;
const Z = balance.enemies.zombie;
const tmp = new THREE.Vector3();

/**
 * A concrete burial bunker sunk into a mound, its door hanging open. While
 * the aircraft is anywhere near, the dead keep walking out of it; when it is
 * destroyed the last of them come out at once. Children are never tagged, so
 * only the crypt itself counts toward an objective.
 */
export class Crypt extends Entity {
  private children: Zombie[] = [];
  private spawnTimer = 2 + Math.random() * 3;
  private wispTimer = 0;
  private smokeTimer = 0;
  /** Doorway in world space, refreshed from the heading each spawn. */
  private readonly door = new THREE.Vector3();

  constructor(
    heading: number,
    /** Zombies released when it falls. */
    private readonly burst = S.burst,
  ) {
    super();
    this.kind = "crypt";
    this.hp = this.maxHp = S.hp;
    this.radius = S.radius;
    this.footprint = { hx: 5, hz: 4.2 };
    this.barHeight = 6;
    this.object.rotation.y = heading;

    const concrete = 0x9a9c90;
    const concreteDark = 0x6e7066;
    const earth = 0x5a5a40;
    const b = new Build();
    // The mound the bunker is dug into: a low dome behind and around it, kept
    // under the roof line so the concrete still reads from the air.
    b.add(new THREE.SphereGeometry(7.5, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.3, 0.85), earth, { y: 0, z: -2.2, mat: { roughness: 1, flat: true } });
    // Bunker body and a thick roof slab, the front face clear of the mound.
    b.box(8, 3.4, 6.4, concrete, { y: 1.7, mat: { roughness: 0.95 } });
    b.box(9, 0.8, 7.4, concreteDark, { y: 3.8, mat: { roughness: 0.95 } });
    // Staining down the front and a cracked lintel.
    b.box(8.05, 1.1, 0.1, 0x4c4e46, { y: 0.55, z: 3.22, mat: { roughness: 1 } });
    b.box(3.4, 0.5, 0.5, concreteDark, { y: 3.15, z: 3.1, rz: 0.03, mat: { roughness: 1 } });
    // Doorway: black, with a dim green glow deep inside.
    b.box(2.2, 2.6, 0.4, 0x0b0d0a, { y: 1.3, z: 3.05 });
    b.box(1.8, 2.2, 0.1, 0x1f5a34, { y: 1.25, z: 2.8, mat: { emissive: 0x2aff6a, roughness: 1 } });
    // Iron door leaf hanging off one hinge, and a plaque above the door.
    b.box(1.05, 2.5, 0.12, P.rust, { x: 1.45, y: 1.2, z: 3.45, ry: -1.1, rz: 0.08, mat: { metalness: 0.5, roughness: 0.7 } });
    b.box(1.6, 0.6, 0.08, concreteDark, { y: 3.0, z: 3.25, mat: { roughness: 1 } });
    // Steps down to the door, and a low ring of mud-stained sandbags.
    for (let i = 0; i < 3; i++) b.box(3.2, 0.3, 0.9, concreteDark, { y: -0.15 - i * 0.05, z: 3.7 + i * 0.9, mat: { roughness: 1 } });
    b.sandbagRing(7.2, 2, 0x7a7360, { y: -0.2, arc: Math.PI * 1.25, start: -Math.PI * 0.375, seed: 5 });
    // A ventilator pipe and a bent aerial on the roof.
    b.cyl(0.32, 0.32, 1.6, P.metalDark, { x: -2.6, y: 4.9, z: -1.4, seg: 8, mat: { metalness: 0.4 } });
    b.cyl(0.5, 0.5, 0.3, P.metalDark, { x: -2.6, y: 5.75, z: -1.4, seg: 8, mat: { metalness: 0.4 } });
    b.cyl(0.05, 0.07, 3.2, P.metalDark, { x: 2.8, y: 5.6, z: -2.2, rz: 0.35, seg: 4, mat: { metalness: 0.5 } });
    this.object.add(b.finish());
  }

  private doorWorld(): THREE.Vector3 {
    const ry = this.object.rotation.y;
    return this.door.set(this.pos.x + Math.sin(ry) * 4.6, this.pos.y, this.pos.z + Math.cos(ry) * 4.6);
  }

  private spawnOne(): void {
    const world = this.world;
    const door = this.doorWorld();
    const z = new Zombie(false);
    z.pos.set(door.x + (Math.random() - 0.5) * 1.2, world.terrain.heightAt(door.x, door.z), door.z + (Math.random() - 0.5) * 1.2);
    world.add(z);
    this.children.push(z);
  }

  update(dt: number): void {
    const world = this.world;
    this.tickFlash(dt);
    const heli = world.heli;
    const d = heli.alive ? this.distanceXZ(heli) : Infinity;

    // Raise another while the aircraft is near, within this crypt's share and
    // the map's ceiling on the walking dead.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = S.spawnEvery;
      if (d < S.wakeRange && world.phase === "playing") {
        this.children = this.children.filter((c) => c.alive);
        let alive = 0;
        for (const e of world.entities) if (e.kind === "zombie" && e.alive) alive++;
        if (this.children.length < S.maxChildren && alive < Z.maxAlive) {
          this.spawnOne();
          world.audio.play("groan", this.pos);
        }
      }
    }

    // Marsh lights drifting out of the doorway.
    if (d < 220) {
      this.wispTimer -= dt;
      if (this.wispTimer <= 0) {
        this.wispTimer = 0.18;
        const door = this.doorWorld();
        tmp.set(door.x + (Math.random() - 0.5) * 3, door.y + 0.6 + Math.random() * 1.6, door.z + (Math.random() - 0.5) * 3);
        world.particles.wisp(tmp);
      }
    }

    if (this.hp < this.maxHp * 0.5) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.15;
        tmp.copy(this.pos);
        tmp.y += 4;
        world.particles.burningSmoke(tmp, 1.2);
      }
    }
  }

  protected onDeath(source?: Entity): void {
    const world = this.world;
    world.explode(this.pos, 7, 40, "neutral", 3.4, this);
    world.spawnWreck(this.pos, this.object.rotation.y, 6, "rubble");
    // The last of the garrison comes up through the rubble.
    const n = this.burst;
    for (let i = 0; i < n; i++) {
      const z = new Zombie(false);
      const a = (i / n) * Math.PI * 2 + 0.7;
      z.pos.set(this.pos.x + Math.cos(a) * 10, 0, this.pos.z + Math.sin(a) * 10);
      z.pos.y = world.terrain.heightAt(z.pos.x, z.pos.z);
      world.add(z);
    }
    world.message("Crypt broken open. Whatever was still down there is coming up.");
    world.reportKill(this, source);
  }
}
