import * as THREE from "three/webgpu";
import { Entity, box, cylinder, sharedMat } from "./Entity";
import { balance } from "../data/balance";
import type { SpawnType } from "../data/mission1";
import { Pow } from "./Pow";

export type StructureType = Extract<SpawnType, "radar" | "hq" | "prison" | "building" | "wall" | "tower" | "fuelDepot">;

const E = balance.enemies;
const CONCRETE = 0xb5aa93;
const CONCRETE_DARK = 0x8d846f;
const ROOF = 0x6f6a5c;
const STEEL = 0x555c50;

/** Buildings and emplacements that do not move. */
export class Structure extends Entity {
  private spinner: THREE.Object3D | null = null;
  private smokeTimer = 0;
  private height = 6;

  constructor(
    readonly type: StructureType,
    heading: number,
    variant = 0,
    length = 20,
  ) {
    super();
    this.kind = type;
    this.object.rotation.y = heading;
    switch (type) {
      case "radar":
        this.hp = this.maxHp = E.radar.hp;
        this.radius = E.radar.radius;
        this.buildRadar();
        break;
      case "hq":
        this.hp = this.maxHp = E.hq.hp;
        this.radius = E.hq.radius;
        this.buildHQ();
        break;
      case "prison":
        this.hp = this.maxHp = E.prison.hp;
        this.radius = E.prison.radius;
        this.buildPrison();
        break;
      case "building":
        this.hp = this.maxHp = E.building.hp;
        this.radius = E.building.radius;
        this.buildBuilding(variant);
        break;
      case "wall":
        this.hp = this.maxHp = E.wall.hp;
        this.radius = Math.max(3, length / 2);
        this.blip = false;
        this.buildWall(length);
        break;
      case "tower":
        this.hp = this.maxHp = E.tower.hp;
        this.radius = E.tower.radius;
        this.blip = false;
        this.buildTower();
        break;
      case "fuelDepot":
        this.hp = this.maxHp = E.fuelDepot.hp;
        this.radius = E.fuelDepot.radius;
        this.blip = false;
        this.buildFuelDepot();
        break;
    }
  }

  private buildRadar(): void {
    const o = this.object;
    o.add(box(9, 4, 7, CONCRETE, 0, 2, 0));
    o.add(box(9.4, 0.5, 7.4, ROOF, 0, 4.25, 0));
    o.add(box(3, 3, 3, CONCRETE_DARK, -2.5, 5.9, 1));
    const mast = cylinder(0.5, 0.7, 7, STEEL, 2, 7.5, -1, 8);
    o.add(mast);
    this.spinner = new THREE.Group();
    this.spinner.position.set(2, 11.2, -1);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(3.4, 14, 10, 0, Math.PI * 2, 0, Math.PI / 3), sharedMat(0xd8d6cc, { roughness: 0.5, metalness: 0.3 }));
    dish.rotation.x = -Math.PI / 2 + 0.6;
    dish.castShadow = true;
    this.spinner.add(dish);
    this.spinner.add(box(0.3, 0.3, 4, STEEL, 0, 0.6, 1.5));
    o.add(this.spinner);
    this.height = 15;
  }

  private buildHQ(): void {
    const o = this.object;
    o.add(box(24, 5, 18, CONCRETE_DARK, 0, 2.5, 0));
    o.add(box(20, 3, 14, CONCRETE, 0, 6.5, 0));
    o.add(box(8, 4, 8, CONCRETE_DARK, -4, 10, 0));
    o.add(cylinder(0.3, 0.3, 9, STEEL, 8, 12, -5, 6));
    const flag = box(3, 1.8, 0.1, 0xa8271f, 9.6, 15.6, -5);
    o.add(flag);
    // Blast walls and bunker slits
    for (const sx of [-1, 1]) o.add(box(2, 3, 20, CONCRETE, sx * 14, 1.5, 0));
    for (const sz of [-1, 1]) o.add(box(26, 1.2, 1.2, 0x2a2a28, 0, 4.4, sz * 9.2));
    this.height = 16;
  }

  private buildPrison(): void {
    const o = this.object;
    o.add(box(14, 6, 10, CONCRETE, 0, 3, 0));
    o.add(box(14.6, 0.6, 10.6, ROOF, 0, 6.3, 0));
    // barred windows
    for (let i = -1; i <= 1; i++) {
      o.add(box(2, 1.4, 0.3, 0x1b1b1b, i * 4, 4, 5.1));
      o.add(box(2, 1.4, 0.3, 0x1b1b1b, i * 4, 4, -5.1));
    }
    o.add(box(3, 3.5, 0.4, 0x3d2f1d, 0, 1.75, 5.2));
    this.height = 8;
  }

  private buildBuilding(variant: number): void {
    const o = this.object;
    if (variant === 0) {
      // Warehouse
      o.add(box(12, 5, 8, 0x9c9384, 0, 2.5, 0));
      const roof = cylinder(4.3, 4.3, 12.4, ROOF, 0, 5, 0, 12);
      roof.rotation.z = Math.PI / 2;
      roof.scale.y = 1;
      roof.scale.x = 0.45;
      o.add(roof);
      o.add(box(3, 3.5, 0.4, 0x3c3c3c, 0, 1.75, 4.1));
      this.height = 9;
    } else if (variant === 1) {
      // Hangar / barracks
      o.add(box(10, 4, 14, 0xa89f88, 0, 2, 0));
      o.add(box(10.6, 0.5, 14.6, ROOF, 0, 4.25, 0));
      for (let i = -2; i <= 2; i++) o.add(box(0.3, 1.2, 1.6, 0x243040, 5.1, 2.4, i * 2.6));
      o.add(cylinder(0.4, 0.4, 3, STEEL, -3, 5.5, -5, 6));
      this.height = 7;
    } else {
      // Flat-roofed house with a smaller upper room
      o.add(box(8, 4.5, 8, 0xd0c3a3, 0, 2.25, 0));
      o.add(box(4.5, 3, 4.5, 0xc8b993, -1.2, 6, 1));
      o.add(box(8.4, 0.35, 8.4, 0x8b7d63, 0, 4.6, 0));
      o.add(box(1.5, 2.6, 0.3, 0x40301e, 1.5, 1.3, 4.1));
      o.add(box(1.4, 1.2, 0.3, 0x243040, -1.8, 2.8, 4.1));
      this.height = 8;
    }
  }

  private buildWall(length: number): void {
    const o = this.object;
    o.add(box(length, 3.2, 1.2, CONCRETE, 0, 1.6, 0));
    o.add(box(length, 0.4, 1.6, CONCRETE_DARK, 0, 3.4, 0));
    // razor wire posts
    const n = Math.max(2, Math.round(length / 4));
    for (let i = 0; i < n; i++) {
      const x = -length / 2 + (i + 0.5) * (length / n);
      o.add(box(0.15, 1.2, 0.15, 0x333333, x, 4.1, 0));
    }
    this.height = 4;
  }

  private buildTower(): void {
    const o = this.object;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) o.add(box(0.35, 9, 0.35, 0x5a4a35, sx * 1.4, 4.5, sz * 1.4));
    o.add(box(3.6, 0.4, 3.6, 0x6b5a42, 0, 9, 0));
    o.add(box(3.6, 1.2, 0.2, 0x7a6a50, 0, 9.8, 1.7));
    o.add(box(3.6, 1.2, 0.2, 0x7a6a50, 0, 9.8, -1.7));
    o.add(box(0.2, 1.2, 3.6, 0x7a6a50, 1.7, 9.8, 0));
    o.add(box(0.2, 1.2, 3.6, 0x7a6a50, -1.7, 9.8, 0));
    o.add(box(4.2, 0.3, 4.2, ROOF, 0, 12.2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) o.add(box(0.2, 2.2, 0.2, 0x5a4a35, sx * 1.9, 11.1, sz * 1.9));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicNodeMaterial({ color: 0xfff2b0 }));
    lamp.position.y = 11.6;
    o.add(lamp);
    this.height = 13;
  }

  private buildFuelDepot(): void {
    const o = this.object;
    o.add(cylinder(2.6, 2.6, 4, 0xc9c2b2, 0, 2, 0, 14));
    o.add(cylinder(2.7, 2.7, 0.3, 0x8a2a22, 0, 3.2, 0, 14));
    o.add(cylinder(2.7, 2.7, 0.3, 0x8a2a22, 0, 1.4, 0, 14));
    o.add(box(0.3, 4.6, 0.3, STEEL, 2.3, 2.3, 2.3));
    const pipe = cylinder(0.2, 0.2, 5, STEEL, 2.6, 0.5, 0, 6);
    pipe.rotation.x = Math.PI / 2;
    o.add(pipe);
    this.height = 5;
  }

  update(dt: number): void {
    this.tickFlash(dt);
    if (this.spinner) this.spinner.rotation.y += 1.2 * dt;
    if (this.hp < this.maxHp * 0.5 && this.type !== "wall") {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = this.type === "hq" ? 0.05 : 0.15;
        const p = this.pos.clone();
        p.y += this.height * 0.6;
        this.world.particles.burningSmoke(p, this.type === "hq" ? 2.5 : 1.4);
      }
    }
  }

  protected onDeath(source?: Entity): void {
    const world = this.world;
    switch (this.type) {
      case "fuelDepot": {
        world.explode(this.pos, E.fuelDepot.blastRadius, E.fuelDepot.blastDamage, "neutral", 4.0, this);
        world.spawnWreck(this.pos, 0, 3, "rubble");
        break;
      }
      case "hq": {
        world.explode(this.pos, 10, 80, "neutral", 4.5, this);
        for (let i = 0; i < 6; i++) {
          const p = this.pos.clone();
          p.x += (Math.random() - 0.5) * 20;
          p.z += (Math.random() - 0.5) * 16;
          p.y += Math.random() * 6;
          world.later(0.15 + i * 0.22, () => world.explode(p, 6, 40, "neutral", 3.0, this));
        }
        world.spawnWreck(this.pos, 0, 9, "rubble");
        world.shake(3);
        break;
      }
      case "prison": {
        world.explode(this.pos, 6, 30, "neutral", 3.2, this);
        world.spawnWreck(this.pos, 0, 6, "rubble");
        // Prisoners escape the rubble.
        for (let i = 0; i < 4; i++) {
          const pow = new Pow();
          const a = (i / 4) * Math.PI * 2 + 0.4;
          pow.pos.set(this.pos.x + Math.cos(a) * 12, 0, this.pos.z + Math.sin(a) * 12);
          pow.pos.y = world.terrain.heightAt(pow.pos.x, pow.pos.z);
          world.add(pow);
        }
        world.message("Prison breached. Four POWs are in the open, winch them up.");
        break;
      }
      case "radar": {
        world.explode(this.pos, 8, 50, "neutral", 3.6, this);
        world.spawnWreck(this.pos, 0, 5, "rubble");
        break;
      }
      case "wall":
      case "tower": {
        world.explode(this.pos, 2.5, 10, "neutral", 1.6, this);
        world.particles.dustHit(this.pos, 3);
        break;
      }
      default: {
        world.explode(this.pos, 5, 30, "neutral", 2.6, this);
        world.spawnWreck(this.pos, this.object.rotation.y, 4, "rubble");
      }
    }
    world.reportKill(this, source);
  }
}
