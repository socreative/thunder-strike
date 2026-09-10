import * as THREE from "three/webgpu";
import { Entity } from "./Entity";
import { balance } from "../data/balance";
import type { SpawnType } from "../data/mission";
import { Build, PALETTE as P } from "../world/Detail";
import { Pow } from "./Pow";

export type StructureType = Extract<SpawnType, "radar" | "hq" | "prison" | "building" | "wall" | "tower" | "fuelDepot" | "generator">;

const E = balance.enemies;

/**
 * Buildings and emplacements that do not move. Each one is assembled from
 * primitives and then merged per material, so the detail costs a few draw
 * calls rather than one per greeble.
 */
export class Structure extends Entity {
  private spinner: THREE.Object3D | null = null;
  private smokeTimer = 0;
  private height = 6;

  constructor(
    readonly type: StructureType,
    heading: number,
    variant = 0,
    length = 20,
    /** Prisoners released when a prison falls. */
    private readonly count = 4,
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
      case "generator":
        this.hp = this.maxHp = E.generator.hp;
        this.radius = E.generator.radius;
        this.buildGenerator();
        break;
    }
    // Each build sets its own silhouette height; float the damage bar above it.
    this.barHeight = this.height + 1.6;
    this.setFootprint(type, variant, length);
  }

  /**
   * Match the hit shape to the model. Half-extents come from the built
   * geometry, and the radius becomes the circumradius so the broad-phase grid
   * query never misses a corner.
   */
  private setFootprint(type: StructureType, variant: number, length: number): void {
    let hx: number;
    let hz: number;
    switch (type) {
      case "radar":
        hx = 5.2;
        hz = 4.3;
        break;
      case "hq":
        hx = 13;
        hz = 10;
        break;
      case "prison":
        hx = 6.9;
        hz = 4.9;
        break;
      case "wall":
        hx = length / 2 + 0.3;
        hz = 1.0;
        break;
      case "tower":
        hx = 2.2;
        hz = 2.2;
        break;
      case "fuelDepot":
        hx = 5.5;
        hz = 4.0;
        break;
      case "generator":
        hx = 7.8;
        hz = 6.0;
        break;
      default:
        // Warehouse is broad, barracks is deep, the house is square.
        hx = variant === 0 ? 6.2 : variant === 1 ? 4.9 : 4.4;
        hz = variant === 0 ? 4.4 : variant === 1 ? 6.9 : 4.4;
    }
    this.footprint = { hx, hz };
    this.radius = Math.sqrt(hx * hx + hz * hz);
  }

  /**
   * Coastal radar: concrete plinth, glazed control cabin and a dish on a
   * lattice mast, with the service clutter that reads from the air.
   */
  private buildRadar(): void {
    const b = new Build();
    b.box(15, 0.28, 12.5, P.tarmac, { y: 0.14, mat: { roughness: 1 } });
    b.box(11, 0.9, 9, P.concreteShadow, { y: 0.45 });
    // Blockhouse with a recessed window band and an overhanging upper deck
    b.box(9.2, 3.4, 7.2, P.concrete, { y: 2.6 });
    b.box(9.4, 0.5, 7.4, P.concreteDark, { y: 1.1 });
    b.box(9.6, 1.1, 7.6, P.glass, { y: 3.5, mat: { roughness: 0.25, metalness: 0.3 } });
    b.box(10.2, 0.45, 8.2, P.concreteDark, { y: 4.5 });
    // Upper observation cabin
    b.box(5.6, 0.4, 5.0, P.concreteShadow, { x: -1.4, y: 4.9, z: 0.4 });
    b.box(5.2, 1.9, 4.6, P.glass, { x: -1.4, y: 6.0, z: 0.4, mat: { roughness: 0.2, metalness: 0.35 } });
    for (const sx of [-3.9, 1.1]) {
      b.box(0.3, 2.1, 0.3, P.concrete, { x: sx, y: 6.0, z: 2.6 });
      b.box(0.3, 2.1, 0.3, P.concrete, { x: sx, y: 6.0, z: -1.8 });
    }
    b.box(6.0, 0.45, 5.4, P.roof, { x: -1.4, y: 7.1, z: 0.4 });
    b.railing(5.6, 0.9, P.metal, { x: -1.4, y: 7.33, z: 2.9 });
    // Roof plant
    b.box(1.8, 1.1, 1.4, P.metal, { x: 3.0, y: 5.3, z: -2.0 });
    b.cyl(0.7, 0.7, 0.35, P.metalDark, { x: 3.0, y: 5.95, z: -2.0, seg: 10 });
    b.box(1.2, 0.8, 1.0, P.metal, { x: 3.2, y: 5.15, z: 1.4 });
    b.cyl(0.22, 0.22, 1.6, P.metalDark, { x: 1.4, y: 5.6, z: 2.6, seg: 6 });
    // External stair
    for (let i = 0; i < 7; i++) b.box(1.8, 0.2, 0.55, P.concreteDark, { x: 5.6, y: 1.1 + i * 0.5, z: -2.6 + i * 0.55 });
    b.railing(4.2, 0.9, P.metal, { x: 5.6, y: 2.6, z: -0.9, ry: Math.PI / 2 });
    // Door and blast bags
    b.box(1.5, 2.4, 0.25, P.metalDark, { x: 2.2, y: 2.1, z: 3.68 });
    b.sandbagWall(4.5, 3, P.sandbag, { x: 2.2, y: 0.9, z: 5.0, seed: 11 });
    // Mast and cable run
    b.latticeMast(7.4, 1.7, P.steel, { x: 2.4, y: 0.9, z: -1.2 });
    b.box(2.6, 0.35, 2.6, P.metal, { x: 2.4, y: 8.4, z: -1.2 });
    b.strut(new THREE.Vector3(2.4, 8.3, -1.2), new THREE.Vector3(0.6, 4.9, -1.0), 0.08, P.metalDark, { metalness: 0.4 }, 4);
    this.spinner = this.buildRadarDish();
    this.spinner.position.set(2.4, 8.9, -1.2);
    this.object.add(this.spinner, b.finish());
    this.height = 14;
  }

  /** Parabolic dish with a rim, back ribs and a feed horn on struts. */
  private buildRadarDish(): THREE.Group {
    const b = new Build();
    b.cyl(0.9, 1.1, 0.6, P.metal, { y: 0.3, seg: 10 });
    b.box(1.6, 0.5, 1.0, P.metalDark, { y: 0.75 });
    // Tipped back so it sweeps the sky rather than the sand.
    const tilt = -0.55;
    const cy = 1.5;
    b.bowl(3.3, P.white, Math.PI / 3.1, { y: cy, rx: Math.PI + tilt, seg: 18, mat: { roughness: 0.45, metalness: 0.2 } });
    b.torus(3.28, 0.09, P.steel, { y: cy, rx: Math.PI / 2 + tilt, seg: 20, mat: { metalness: 0.5 } });
    for (let i = 0; i < 6; i++) {
      b.box(0.1, 0.1, 3.1, P.steel, { y: cy - 0.45 * Math.cos(tilt), rx: tilt, ry: (i / 6) * Math.PI * 2, mat: { metalness: 0.5 } });
    }
    const focus = new THREE.Vector3(-Math.sin(tilt) * 2.4, cy + Math.cos(tilt) * 2.4, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.strut(new THREE.Vector3(Math.cos(a) * 2.6, cy + Math.sin(tilt) * 0.2, Math.sin(a) * 2.6), focus, 0.06, P.steel, { metalness: 0.5 }, 4);
    }
    b.cyl(0.16, 0.34, 0.8, P.metalDark, { x: focus.x, y: focus.y, z: focus.z, rx: tilt, seg: 8 });
    const g = b.finish();
    g.name = "radar-dish";
    return g;
  }

  /** Command bunker: a stepped concrete mass behind blast walls and revetments. */
  private buildHQ(): void {
    const b = new Build();
    b.box(30, 0.26, 23, P.tarmac, { y: 0.13, mat: { roughness: 1 } });
    b.box(24, 4.6, 18, P.concreteShadow, { y: 2.3 });
    b.box(22, 0.4, 16.4, P.concreteDark, { y: 4.75 });
    b.box(19, 3.2, 13.5, P.concrete, { y: 6.5 });
    b.box(20, 0.4, 14.5, P.concreteDark, { y: 8.25 });
    b.box(9, 3.6, 8, P.concreteShadow, { x: -4, y: 10.2 });
    b.box(9.6, 0.4, 8.6, P.concreteDark, { x: -4, y: 12.2 });
    // Embrasure slits
    for (const sz of [-1, 1]) b.box(21, 0.9, 0.5, P.metalDark, { y: 3.6, z: sz * 9.1 });
    for (const sx of [-1, 1]) b.box(0.5, 0.9, 15, P.metalDark, { x: sx * 12.1, y: 3.6 });
    for (const sz of [-1, 1]) b.box(16, 0.7, 0.4, P.metalDark, { y: 7.2, z: sz * 6.9 });
    // Earth banked against the lower walls
    for (const sz of [-1, 1]) b.box(26, 2.6, 3.2, P.sandbagDark, { y: 1.3, z: sz * 10.6, rx: sz * 0.32, mat: { roughness: 1, flat: true } });
    // Blast walls
    for (const sx of [-1, 1]) {
      b.box(1.4, 3.4, 20, P.concrete, { x: sx * 15, y: 1.7 });
      b.box(1.8, 0.4, 20.4, P.concreteDark, { x: sx * 15, y: 3.6 });
    }
    b.sandbagWall(9, 4, P.sandbag, { x: 0, y: 0, z: 12.4, seed: 3 });
    b.sandbagWall(7, 3, P.sandbag, { x: -9, y: 0, z: -11.5, seed: 5 });
    // Entrance
    b.box(6, 3.2, 4, P.concreteShadow, { y: 1.6, z: 10.4 });
    b.box(3.2, 2.6, 0.4, P.metalDark, { y: 1.3, z: 8.6 });
    // Roof clutter and antennas
    b.latticeMast(9, 1.2, P.steel, { x: 8, y: 8.4, z: -5 });
    b.cyl(0.12, 0.12, 4, P.steel, { x: 8, y: 19.4, z: -5, seg: 5 });
    for (const [ax, az] of [
      [6.2, 3.4],
      [9.4, 4.2],
    ] as [number, number][]) {
      b.cyl(0.1, 0.1, 3.4, P.steel, { x: ax, y: 10.1, z: az, seg: 4 });
      b.sphere(0.22, P.hazard, { x: ax, y: 11.9, z: az, seg: 6, mat: { emissive: 0x551100 } });
    }
    b.box(3.4, 1.4, 2.4, P.metal, { x: 3.5, y: 9.0, z: -3.5 });
    b.cyl(1.0, 1.0, 0.4, P.metalDark, { x: 3.5, y: 9.85, z: -3.5, seg: 12 });
    b.box(2.4, 1.0, 2.0, P.metal, { x: 3.2, y: 8.8, z: 3.2 });
    b.box(3.2, 1.9, 0.12, P.hazard, { x: 9.7, y: 20.4, z: -5 });
    b.railing(18, 1.0, P.metal, { y: 8.45, z: 6.9 });
    b.railing(18, 1.0, P.metal, { y: 8.45, z: -6.9 });
    this.object.add(b.finish());
    this.height = 16;
  }

  /** Prison block: barred cell windows, roof tank and a guarded steel door. */
  private buildPrison(): void {
    const b = new Build();
    b.box(15.5, 0.26, 11.5, P.tarmac, { y: 0.13, mat: { roughness: 1 } });
    b.box(14, 0.6, 10, P.concreteShadow, { y: 0.3 });
    b.box(13.4, 5.4, 9.4, P.concrete, { y: 3.3 });
    for (let i = -2; i <= 2; i++) {
      b.box(0.5, 5.4, 0.4, P.concreteDark, { x: i * 3.1, y: 3.3, z: 4.75 });
      b.box(0.5, 5.4, 0.4, P.concreteDark, { x: i * 3.1, y: 3.3, z: -4.75 });
    }
    // Barred cell windows
    for (const sz of [1, -1]) {
      for (let i = -1; i <= 1; i++) {
        b.box(1.9, 1.5, 0.35, 0x241f19, { x: i * 3.1 + 1.55, y: 4.2, z: sz * 4.72 });
        for (let bar = 0; bar < 4; bar++) {
          b.box(0.09, 1.5, 0.12, P.metalDark, { x: i * 3.1 + 0.85 + bar * 0.46, y: 4.2, z: sz * 4.85 });
        }
      }
    }
    // Roof: parapet, vents, water tank
    b.box(14.6, 0.5, 10.6, P.roof, { y: 6.25 });
    b.box(14.8, 0.7, 0.4, P.concreteDark, { y: 6.75, z: 5.2 });
    b.box(14.8, 0.7, 0.4, P.concreteDark, { y: 6.75, z: -5.2 });
    for (const sx of [-7.2, 7.2]) b.box(0.4, 0.7, 10.6, P.concreteDark, { x: sx, y: 6.75 });
    b.cyl(1.3, 1.3, 1.6, P.steel, { x: -4.4, y: 7.3, z: -2.6, seg: 12, mat: { metalness: 0.4 } });
    b.cyl(1.35, 1.35, 0.16, P.metalDark, { x: -4.4, y: 8.1, z: -2.6, seg: 12 });
    for (let i = 0; i < 3; i++) b.cyl(0.35, 0.35, 0.7, P.metalDark, { x: 2 + i * 2.2, y: 6.85, z: 2.4, seg: 8 });
    // Door, lamp and guard post
    b.box(3.2, 3.6, 0.4, 0x3a3128, { y: 1.8, z: 4.95 });
    b.box(3.6, 0.4, 0.7, P.concreteDark, { y: 3.8, z: 5.05 });
    b.sphere(0.24, 0xfff0b0, { y: 4.1, z: 5.2, seg: 6, mat: { emissive: 0x554400 } });
    b.sandbagWall(5, 3, P.sandbag, { x: 5.4, y: 0, z: 6.4, seed: 21 });
    b.ladder(6.6, 0.7, P.metalDark, { x: -6.9, y: 0.6, z: 3.4, ry: Math.PI / 2 });
    this.object.add(b.finish());
    this.height = 8;
  }

  private buildBuilding(variant: number): void {
    const b = new Build();
    if (variant === 0) {
      // Warehouse: corrugated barrel roof, roller door, loading dock
      b.box(13.4, 0.26, 9.6, P.tarmac, { y: 0.13, mat: { roughness: 1 } });
      b.box(12, 4.6, 8.4, 0xa79d88, { y: 2.3 });
      for (let i = -2; i <= 2; i++) b.box(0.35, 4.6, 0.3, P.concreteDark, { x: i * 2.7, y: 2.3, z: 4.3 });
      // Shallow gabled roof of corrugated sheet, with eaves and a ridge cap
      for (const sz of [-1, 1]) {
        b.corrugatedRoof(12.6, 4.7, P.roof, { y: 5.15 + sz * 0, z: sz * 2.25, rx: sz * 0.28 });
      }
      b.box(12.8, 0.34, 0.7, P.metalDark, { y: 5.82 });
      b.box(12.8, 0.3, 0.45, P.metalDark, { y: 4.5, z: 4.55 });
      b.box(12.8, 0.3, 0.45, P.metalDark, { y: 4.5, z: -4.55 });
      // Roller door with guide rails
      b.box(4.4, 3.8, 0.3, 0x59544a, { y: 1.9, z: 4.32 });
      for (let i = 0; i < 7; i++) b.box(4.4, 0.1, 0.36, 0x46423a, { y: 0.5 + i * 0.55, z: 4.36 });
      for (const sx of [-2.4, 2.4]) b.box(0.35, 4.1, 0.4, P.metalDark, { x: sx, y: 2.05, z: 4.36 });
      // Loading dock and crates
      b.box(5.6, 0.9, 2.4, P.concreteShadow, { y: 0.45, z: 5.6 });
      b.box(1.5, 1.2, 1.2, P.olive, { x: 4.6, y: 0.6, z: 5.2, ry: 0.3 });
      b.box(1.5, 1.2, 1.2, P.olive, { x: 4.4, y: 1.8, z: 5.4, ry: -0.2 });
      b.cyl(0.55, 0.55, 1.5, P.rust, { x: -5.2, y: 0.75, z: 5.4, seg: 10 });
      b.cyl(0.55, 0.55, 1.5, P.rust, { x: -4.0, y: 0.75, z: 5.6, seg: 10 });
      this.height = 8;
    } else if (variant === 1) {
      // Barracks: pitched roof, window row, chimney, air units
      b.box(11.2, 0.26, 15.2, P.tarmac, { y: 0.13, mat: { roughness: 1 } });
      b.box(10, 0.5, 14, P.concreteShadow, { y: 0.25 });
      b.box(9.4, 3.6, 13.4, 0xb0a68f, { y: 2.3 });
      for (let i = -2; i <= 2; i++) {
        b.box(0.4, 3.6, 0.35, P.concreteDark, { x: 4.7, y: 2.3, z: i * 2.7 });
        b.box(0.4, 3.6, 0.35, P.concreteDark, { x: -4.7, y: 2.3, z: i * 2.7 });
      }
      for (let i = -2; i <= 2; i++) {
        b.box(0.28, 1.3, 1.5, P.glass, { x: 4.72, y: 2.7, z: i * 2.7 + 1.35, mat: { roughness: 0.25, metalness: 0.3 } });
        b.box(0.28, 1.3, 1.5, P.glass, { x: -4.72, y: 2.7, z: i * 2.7 + 1.35, mat: { roughness: 0.25, metalness: 0.3 } });
      }
      // Pitched roof from two slabs
      for (const sx of [-1, 1]) {
        b.box(5.4, 0.35, 14, P.roof, { x: sx * 2.5, y: 4.9, z: 0, rz: sx * 0.42 });
      }
      b.box(0.7, 0.4, 14.2, P.metalDark, { y: 5.98 });
      b.box(9.8, 0.35, 0.5, P.concreteDark, { y: 4.25, z: 6.85 });
      b.box(9.8, 0.35, 0.5, P.concreteDark, { y: 4.25, z: -6.85 });
      b.cyl(0.4, 0.45, 2.6, P.concreteDark, { x: -3, y: 5.8, z: -4.6, seg: 8 });
      b.cyl(0.5, 0.5, 0.25, P.metalDark, { x: -3, y: 7.2, z: -4.6, seg: 8 });
      b.box(1.6, 0.9, 1.3, P.metal, { x: 2.4, y: 5.5, z: 3.4 });
      b.box(1.5, 2.4, 0.3, P.woodDark, { y: 1.2, z: 6.75 });
      b.box(2.6, 0.3, 1.2, P.metalDark, { y: 2.6, z: 7.2 });
      b.sandbagWall(5, 2, P.sandbag, { x: 3.2, y: 0, z: 8.2, seed: 33 });
      this.height = 8;
    } else {
      // Flat-roofed house: parapet, stair box, roof tank, awning
      b.box(9.6, 0.26, 9.6, P.tarmac, { y: 0.13, mat: { roughness: 1 } });
      b.box(8.4, 4.4, 8.4, 0xcfc0a0, { y: 2.2 });
      b.box(8.8, 0.4, 8.8, 0x9d8f74, { y: 4.55 });
      b.box(8.8, 0.75, 0.35, 0xc4b596, { y: 5.1, z: 4.22 });
      b.box(8.8, 0.75, 0.35, 0xc4b596, { y: 5.1, z: -4.22 });
      for (const sx of [-4.22, 4.22]) b.box(0.35, 0.75, 8.8, 0xc4b596, { x: sx, y: 5.1 });
      // Upper room and stair head
      b.box(4.2, 2.8, 4.0, 0xc7b795, { x: -1.6, y: 6.15, z: 1.2 });
      b.box(4.6, 0.35, 4.4, 0x9d8f74, { x: -1.6, y: 7.7, z: 1.2 });
      b.box(1.0, 1.2, 0.25, P.glass, { x: -1.6, y: 6.4, z: 3.22, mat: { roughness: 0.3 } });
      // Roof water tank on a frame
      for (const [tx, tz] of [
        [-1.4, -1.4],
        [1.4, -1.4],
        [1.4, 1.4],
        [-1.4, 1.4],
      ] as [number, number][]) {
        b.box(0.16, 1.0, 0.16, P.metalDark, { x: 2.6 + tx * 0.35, y: 5.25, z: -2.4 + tz * 0.35 });
      }
      b.cyl(1.0, 1.0, 1.2, 0x8d9aa2, { x: 2.6, y: 6.35, z: -2.4, seg: 12, mat: { metalness: 0.3 } });
      b.cyl(1.05, 1.05, 0.14, P.metalDark, { x: 2.6, y: 6.98, z: -2.4, seg: 12 });
      // Door, windows, awning
      b.box(1.5, 2.6, 0.3, 0x53381f, { x: 1.6, y: 1.3, z: 4.28 });
      b.box(2.4, 0.16, 1.4, 0x7d6a4a, { x: 1.6, y: 2.75, z: 4.9 });
      for (const [wx, wz, ry] of [
        [-2.0, 4.3, 0],
        [-4.3, 1.6, Math.PI / 2],
        [4.3, -1.4, Math.PI / 2],
      ] as [number, number, number][]) {
        b.box(1.5, 1.4, 0.28, P.glass, { x: wx, y: 2.7, z: wz, ry, mat: { roughness: 0.3, metalness: 0.3 } });
        b.box(1.75, 0.2, 0.36, 0x9d8f74, { x: wx, y: 3.5, z: wz, ry });
      }
      // External stair up the side
      for (let i = 0; i < 8; i++) b.box(1.4, 0.22, 0.5, 0xb5a68a, { x: -4.9, y: 0.6 + i * 0.55, z: -3.4 + i * 0.5 });
      this.height = 8;
    }
    this.object.add(b.finish());
  }

  /** Precast perimeter wall: panels, posts, coping and razor wire. */
  private buildWall(length: number): void {
    const b = new Build();
    const panels = Math.max(1, Math.round(length / 4));
    const panelW = length / panels;
    b.box(length + 0.4, 0.4, 1.9, P.concreteShadow, { y: 0.2 });
    for (let i = 0; i < panels; i++) {
      const x = -length / 2 + (i + 0.5) * panelW;
      b.box(panelW - 0.28, 3.0, 1.0, P.concrete, { x, y: 1.85 });
      // Shallow recessed field on each face
      b.box(panelW - 1.1, 1.9, 0.14, P.concreteDark, { x, y: 1.95, z: 0.52 });
      b.box(panelW - 1.1, 1.9, 0.14, P.concreteDark, { x, y: 1.95, z: -0.52 });
    }
    for (let i = 0; i <= panels; i++) {
      b.box(0.5, 3.5, 1.25, P.concreteDark, { x: -length / 2 + i * panelW, y: 1.9 });
    }
    b.box(length + 0.4, 0.32, 1.35, P.concreteDark, { y: 3.5 });
    // Razor wire on Y-brackets
    for (let i = 0; i <= panels; i++) {
      const x = -length / 2 + i * panelW;
      b.box(0.1, 0.9, 0.1, P.metalDark, { x, y: 4.1, z: 0.3, rz: 0.35 });
      b.box(0.1, 0.9, 0.1, P.metalDark, { x, y: 4.1, z: -0.3, rz: -0.35 });
    }
    b.razorWire(length, 0.42, P.steel, { y: 4.5 });
    this.object.add(b.finish());
    this.height = 5;
  }

  /** Guard tower: braced legs, ladder, glazed cabin, overhanging roof, lamp. */
  private buildTower(): void {
    const b = new Build();
    const legH = 8.4;
    b.box(5.2, 0.4, 5.2, P.concreteShadow, { y: 0.2 });
    const corners: [number, number][] = [
      [-1.5, -1.5],
      [1.5, -1.5],
      [1.5, 1.5],
      [-1.5, 1.5],
    ];
    for (const [cx, cz] of corners) {
      b.box(0.4, legH, 0.4, P.wood, { x: cx, y: legH / 2, z: cz });
      b.box(0.6, 0.5, 0.6, P.concreteDark, { x: cx, y: 0.4, z: cz });
    }
    // Cross bracing on every face, two bays high
    for (let bay = 0; bay < 2; bay++) {
      const y0 = 0.6 + bay * (legH - 1.2) * 0.5;
      const y1 = y0 + (legH - 1.2) * 0.5;
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i];
        const [bx, bz] = corners[(i + 1) % 4];
        b.strut(new THREE.Vector3(ax, y0, az), new THREE.Vector3(bx, y1, bz), 0.08, P.woodDark, { roughness: 0.9 }, 4);
        b.box(3.0, 0.16, 0.16, P.woodDark, { x: (ax + bx) / 2, y: y1, z: (az + bz) / 2, ry: i % 2 === 0 ? 0 : Math.PI / 2 });
      }
    }
    b.ladder(legH, 0.8, P.woodDark, { z: 1.8, y: 0 });
    // Cabin floor, walls and window band
    b.box(4.2, 0.35, 4.2, P.wood, { y: legH + 0.18 });
    for (const sz of [-1, 1]) {
      b.box(4.2, 1.0, 0.22, 0x8f7550, { y: legH + 0.85, z: sz * 2.0 });
      b.box(4.2, 0.9, 0.18, 0x1b2226, { y: legH + 1.75, z: sz * 2.02 });
    }
    for (const sx of [-1, 1]) {
      b.box(0.22, 1.0, 4.2, 0x8f7550, { x: sx * 2.0, y: legH + 0.85 });
      b.box(0.18, 0.9, 4.2, 0x1b2226, { x: sx * 2.02, y: legH + 1.75 });
    }
    for (const [px, pz] of corners) {
      b.box(0.22, 2.3, 0.22, P.woodDark, { x: px * 1.33, y: legH + 1.35, z: pz * 1.33 });
    }
    // Overhanging roof
    b.box(5.4, 0.3, 5.4, P.roof, { y: legH + 2.65 });
    b.box(4.4, 0.5, 4.4, P.woodDark, { y: legH + 2.4 });
    b.cone(3.4, 0.9, P.roof, { y: legH + 3.2, seg: 4, ry: Math.PI / 4 });
    // Searchlight and aerial
    b.cyl(0.42, 0.42, 0.6, P.metalDark, { x: 1.4, y: legH + 3.1, z: 1.4, rx: 1.1, seg: 10 });
    b.sphere(0.34, 0xfff2b8, { x: 1.65, y: legH + 2.85, z: 1.65, seg: 8, mat: { emissive: 0x776022 } });
    b.cyl(0.07, 0.07, 2.4, P.steel, { x: -1.6, y: legH + 4.0, z: -1.6, seg: 4 });
    this.height = 13;
    this.object.add(b.finish());
  }

  /** Fuel farm: horizontal tanks on saddles, with pipework, valves and a bund. */
  /** Dam powerhouse: turbine hall, transformer yard behind a fence and a pylon taking the lines out. */
  private buildGenerator(): void {
    const b = new Build();
    b.box(15.4, 0.3, 11.6, P.concreteShadow, { y: 0.15, mat: { roughness: 1 } });
    // Turbine hall with a clerestory and vents
    b.box(9.5, 5.2, 7.2, P.concrete, { x: -2.4, y: 2.6 });
    b.box(8.0, 1.2, 3.6, P.concreteDark, { x: -2.4, y: 5.8 });
    for (let i = -1; i <= 1; i++) b.box(0.5, 0.9, 3.4, P.glass, { x: -2.4 + i * 2.6, y: 5.8, mat: { roughness: 0.3, metalness: 0.4 } });
    for (let i = -2; i <= 2; i++) b.box(1.3, 1.6, 0.2, P.glass, { x: -2.4 + i * 1.8, y: 3.3, z: 3.7, mat: { roughness: 0.3, metalness: 0.4 } });
    b.box(2.6, 3.2, 0.3, 0x59544a, { x: -5.5, y: 1.6, z: 3.7 });
    b.corrugatedRoof(9.9, 7.6, P.roof, { x: -2.4, y: 5.25 });
    // Penstock pipes coming out of the hall toward the dam side
    for (const sz of [-1.8, 1.8]) {
      b.cyl(0.8, 0.8, 4.2, P.steel, { x: -8.4, y: 1.6, z: sz, rz: Math.PI / 2, seg: 12, mat: { metalness: 0.5 } });
      b.torus(0.85, 0.12, P.metalDark, { x: -7.2, y: 1.6, z: sz, ry: Math.PI / 2, seg: 12 });
    }
    // Transformer yard: three transformers with cooling fins and insulators
    for (let i = 0; i < 3; i++) {
      const x = 3.6;
      const z = -3.6 + i * 3.4;
      b.box(2.0, 2.2, 1.6, P.metalDark, { x, y: 1.3, z, mat: { metalness: 0.4 } });
      for (let f = 0; f < 5; f++) b.box(0.12, 1.8, 1.8, P.metal, { x: x - 1.1 + f * 0.55, y: 1.3, z, mat: { metalness: 0.4 } });
      for (const ix of [-0.5, 0.2, 0.9]) b.cyl(0.14, 0.18, 1.1, P.white, { x: x + ix, y: 2.95, z, seg: 8 });
      b.cyl(0.4, 0.4, 0.5, P.metalDark, { x, y: 0.25, z, seg: 10 });
    }
    // Chain fence on posts round the yard
    for (const [fx, fz, len, ry] of [
      [3.6, -5.6, 6.4, 0],
      [3.6, 5.6, 6.4, 0],
      [6.8, 0, 11.2, Math.PI / 2],
    ] as [number, number, number, number][]) {
      b.railing(len, 2.0, P.steel, { x: fx, y: 0.3, z: fz, ry });
    }
    // Pylon carrying the lines out over the jungle
    b.latticeMast(11, 1.8, P.steel, { x: 6.2, y: 0.3, z: 0 });
    b.box(4.6, 0.25, 0.25, P.steel, { x: 6.2, y: 9.6 });
    b.box(3.4, 0.25, 0.25, P.steel, { x: 6.2, y: 11.0 });
    // Warning stripes on the hall corner and a floodlight mast
    b.box(0.5, 5.2, 0.5, P.hazard, { x: 2.5, y: 2.6, z: 3.6 });
    b.cyl(0.12, 0.14, 6.5, P.metalDark, { x: -7.0, y: 3.4, z: -5.0, seg: 6 });
    b.box(0.7, 0.4, 0.5, P.white, { x: -7.0, y: 6.7, z: -4.8, rx: 0.5, mat: { emissive: 0x554c33 } });
    this.object.add(b.finish());
    this.height = 11;
  }

  private buildFuelDepot(): void {
    const b = new Build();
    const tankR = 1.75;
    const tankL = 7.2;
    const tankY = tankR + 0.85;
    // Bund wall and floor
    b.box(11, 0.35, 8, P.concreteShadow, { y: 0.17, mat: { roughness: 1 } });
    for (const sz of [-1, 1]) b.box(11, 0.85, 0.5, P.concrete, { y: 0.42, z: sz * 3.9 });
    for (const sx of [-1, 1]) b.box(0.5, 0.85, 8, P.concrete, { x: sx * 5.4, y: 0.42 });
    // Saddle cradles
    for (const sx of [-2.3, 2.3]) {
      b.box(1.0, 1.1, 4.2, P.concreteDark, { x: sx, y: 0.9 });
      b.box(1.2, 0.3, 4.6, P.concreteShadow, { x: sx, y: 1.5 });
    }
    // Tank barrel with domed ends and reinforcing bands
    b.cyl(tankR, tankR, tankL, 0xc6bda8, { y: tankY, rz: Math.PI / 2, seg: 16, mat: { metalness: 0.35, roughness: 0.55 } });
    for (const sx of [-1, 1]) {
      b.sphere(tankR, 0xc6bda8, { x: sx * (tankL / 2), y: tankY, seg: 16, s: [0.55, 1, 1], mat: { metalness: 0.35, roughness: 0.55 } });
    }
    for (const bx of [-2.2, 0, 2.2]) {
      b.cyl(tankR + 0.06, tankR + 0.06, 0.22, P.hazard, { x: bx, y: tankY, rz: Math.PI / 2, seg: 16 });
    }
    // Walkway along the top with a handrail
    b.box(6.4, 0.12, 1.0, P.metalDark, { y: tankY + tankR + 0.06 });
    b.railing(6.2, 0.85, P.steel, { y: tankY + tankR + 0.12, z: 0.5 });
    b.ladder(tankY + tankR, 0.7, P.steel, { x: 2.9, z: 1.9 });
    // Manway, vent and valve manifold
    b.cyl(0.55, 0.55, 0.3, P.steel, { x: -1.2, y: tankY + tankR + 0.14, seg: 10, mat: { metalness: 0.5 } });
    b.cyl(0.18, 0.18, 1.1, P.steel, { x: 1.6, y: tankY + tankR + 0.55, seg: 8, mat: { metalness: 0.5 } });
    b.cyl(0.3, 0.3, 0.2, P.metalDark, { x: 1.6, y: tankY + tankR + 1.1, seg: 8 });
    // Pipework running off the end into the ground
    b.cyl(0.24, 0.24, 3.0, P.steel, { x: -4.6, y: tankY - 0.4, rz: Math.PI / 2, seg: 8, mat: { metalness: 0.5 } });
    b.cyl(0.24, 0.24, 2.2, P.steel, { x: -6.0, y: tankY - 1.5, seg: 8, mat: { metalness: 0.5 } });
    b.cyl(0.34, 0.34, 0.35, P.hazard, { x: -6.0, y: tankY - 0.5, seg: 8 });
    b.box(0.5, 0.14, 0.5, P.hazard, { x: -6.0, y: tankY - 0.3, ry: 0.4 });
    // A couple of loose drums beside the bund
    for (const [dx, dz, dr] of [
      [4.3, 2.9, 0.3],
      [5.1, 2.2, -0.5],
    ] as [number, number, number][]) {
      b.cyl(0.52, 0.52, 1.4, P.rust, { x: dx, y: 0.7, z: dz, ry: dr, seg: 10 });
      b.cyl(0.55, 0.55, 0.1, 0x6b4426, { x: dx, y: 1.15, z: dz, seg: 10 });
      b.cyl(0.55, 0.55, 0.1, 0x6b4426, { x: dx, y: 0.35, z: dz, seg: 10 });
    }
    this.object.add(b.finish());
    this.height = 6;
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
        const n = this.count;
        for (let i = 0; i < n; i++) {
          const pow = new Pow();
          const a = (i / n) * Math.PI * 2 + 0.4;
          pow.pos.set(this.pos.x + Math.cos(a) * 12, 0, this.pos.z + Math.sin(a) * 12);
          pow.pos.y = world.terrain.heightAt(pow.pos.x, pow.pos.z);
          world.add(pow);
        }
        world.message(`Prison breached. ${["No", "One", "Two", "Three", "Four", "Five", "Six"][n] ?? n} POW${n === 1 ? " is" : "s are"} in the open, winch them up.`);
        break;
      }
      case "radar": {
        world.explode(this.pos, 8, 50, "neutral", 3.6, this);
        world.spawnWreck(this.pos, 0, 5, "rubble");
        break;
      }
      case "generator": {
        world.explode(this.pos, 9, 60, "neutral", 3.8, this);
        // Transformers arc and let go one after another.
        const ry = this.object.rotation.y;
        for (let i = 0; i < 3; i++) {
          const lx = 3.6;
          const lz = -3.6 + i * 3.4;
          const p = this.pos.clone();
          p.x += lx * Math.cos(ry) + lz * Math.sin(ry);
          p.z += -lx * Math.sin(ry) + lz * Math.cos(ry);
          p.y += 1.5;
          world.later(0.2 + i * 0.25, () => {
            world.explode(p, 4, 20, "neutral", 2.2, this);
            for (let k = 0; k < 4; k++) world.particles.spark(p, 0x9fd8ff);
          });
        }
        world.spawnWreck(this.pos, ry, 6, "rubble");
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
