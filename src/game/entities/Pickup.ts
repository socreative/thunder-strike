import * as THREE from "three/webgpu";
import { Build } from "../world/Detail";
import { Entity } from "./Entity";
import { balance } from "../data/balance";
import type { PickupItem } from "../data/mission";
import type { Helicopter } from "./Helicopter";

const P = balance.pickups;
const W = balance.weapons;

export class Pickup extends Entity {
  private t = Math.random() * 10;
  private baseY = 0;
  private readonly beacon: THREE.Mesh;

  constructor(readonly item: PickupItem) {
    super();
    this.kind = "pickup";
    this.team = "neutral";
    this.targetable = false;
    this.showHealthBar = false;
    this.radius = 2;
    // One merged mesh per crate: there are a dozen or more on every map.
    const b = new Build();
    if (item === "fuel") {
      b.cyl(1.1, 1.1, 2.2, 0xb8332a, { y: 1.1, seg: 12 });
      b.cyl(1.15, 1.15, 0.25, 0xe8e2d2, { y: 1.1, seg: 12 });
      b.cyl(1.15, 1.15, 0.25, 0xe8e2d2, { y: 1.8, seg: 12 });
    } else if (item === "ammo") {
      b.box(2.6, 1.4, 1.8, 0x6b7a3d, { y: 0.7 });
      b.box(2.7, 0.2, 0.3, 0x2c3325, { y: 1.45 });
      b.box(0.3, 1.5, 1.9, 0x2c3325, { x: 0.8, y: 0.75 });
      b.box(0.3, 1.5, 1.9, 0x2c3325, { x: -0.8, y: 0.75 });
    } else {
      b.box(2.4, 1.6, 2.0, 0x9aa1a6, { y: 0.8 });
      b.box(1.4, 0.3, 0.3, 0xd83a2e, { y: 1.62 });
      b.box(0.3, 0.3, 1.4, 0xd83a2e, { y: 1.62 });
    }
    this.object.add(b.finish());
    // Marker beacon so crates read from the air.
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicNodeMaterial({ color: item === "fuel" ? 0xff6a4a : item === "ammo" ? 0xffd04a : 0x6ad0ff }));
    beacon.position.y = 3.2;
    beacon.name = "beacon";
    this.beacon = beacon;
    this.object.add(beacon);
  }

  onSpawn(): void {
    this.baseY = this.pos.y;
  }

  update(dt: number): void {
    this.t += dt;
    this.object.rotation.y = this.t * 0.5;
    this.beacon.position.y = 3.2 + Math.sin(this.t * 3) * 0.3;
    this.pos.y = this.baseY;
    this.syncObject();
  }

  collect(heli: Helicopter): void {
    const world = this.world;
    if (this.item === "fuel") {
      heli.fuel = Math.min(balance.heli.fuelMax, heli.fuel + P.fuel);
      world.message("Fuel drum recovered.");
    } else if (this.item === "ammo") {
      heli.ammo.gun = Math.min(W.gun.ammo, heli.ammo.gun + P.ammo.gun);
      heli.ammo.hydra = Math.min(W.hydra.ammo, heli.ammo.hydra + P.ammo.hydra);
      heli.ammo.hellfire = Math.min(W.hellfire.ammo, heli.ammo.hellfire + P.ammo.hellfire);
      heli.flares = Math.min(balance.heli.flares, heli.flares + P.ammo.flares);
      world.message("Ammunition crate recovered.");
    } else {
      heli.hp = Math.min(heli.maxHp, heli.hp + P.armor);
      world.message("Armour crate recovered.");
    }
    world.events.emit("pickup", { kind: this.item });
    world.audio.play("pickup");
    this.kill();
  }
}
