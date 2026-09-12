import * as THREE from "three/webgpu";
import { box, cylinder, sharedMat } from "../entities/Entity";
import type { DecorItem, MissionData } from "../data/mission";
import { Build, PALETTE as P } from "./Detail";
import type { Terrain } from "./Terrain";
import { createCarrier } from "./Carrier";
import type { Assets } from "../core/Assets";
import { Random } from "../core/Random";

/** Length overall in world metres, and how far of its height sits below water. */
const CARRIER_LENGTH = 125;
const CARRIER_DRAFT = 0.18;
/**
 * Parked jets, scaled to the carrier rather than to life. The ship is already
 * compressed against the 18 m helicopter, so a true-length fighter would swamp
 * the deck.
 */
const JET_LENGTH = 10;
/** Tent footprint in world metres, against the 18 m helicopter. */
const TENT_WIDTH = 7.5;
/**
 * Camp tents: lateral, fore-aft and heading, in landing-zone local metres. The
 * model's door is on its local +Z, so each heading turns that toward the pad.
 * Even spacing within each row is what makes it read as a camp.
 */
const TENT_SPOTS: [number, number, number][] = [
  // Row beside the pad, doors facing the pad.
  [-24, -9, -Math.PI / 2],
  [-24, 1, -Math.PI / 2],
  [-24, 11, -Math.PI / 2],
  // Row beside the flag at (12, 14). Turned across the row so the tents stand
  // shoulder to shoulder rather than end to end, and spaced to their 3.4 m
  // width rather than their 7.5 m length.
  [6.5, 23, -Math.PI / 2],
  [12, 23, -Math.PI / 2],
  [17.5, 23, -Math.PI / 2],
];
/**
 * Where aircraft sit, in carrier-local metres: lateral, fore-aft, heading. The
 * measured deck is 31.6 m across, so anything past about 11 m hangs over the
 * side and its spot is dropped.
 */
const DECK_SPOTS: [number, number, number][] = [
  [10, -42, 0.4],
  [10.5, -29, 0.35],
  [10, -16, 0.4],
  [9.5, -3, 0.3],
  [-10, -47, -0.45],
  [-10.5, -34, -0.35],
  [9, 24, 1.8],
  [-9.5, 12, -0.3],
];

/**
 * Drop aircraft onto the flight deck. Each spot is found by casting downwards
 * and keeping only hits that land on the broad flat deck, so a spot over the
 * island or off the edge is skipped rather than left hanging in the air.
 */
function parkAircraft(holder: THREE.Group, model: THREE.Object3D, assets: Assets): void {
  const jet = assets.get("jet");
  const jetSize = assets.size("jet");
  if (!jet || !jetSize) return;
  holder.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const hits: { x: number; z: number; y: number; ry: number }[] = [];
  for (const [lx, lz, ry] of DECK_SPOTS) {
    ray.set(new THREE.Vector3(lx, 120, lz), down);
    const hit = ray.intersectObject(model, true)[0];
    if (hit) hits.push({ x: lx, z: lz, y: hit.point.y, ry });
  }
  if (hits.length === 0) return;
  // The deck is the level most spots share; anything well above it is the island.
  const median = [...hits].sort((a, b) => a.y - b.y)[Math.floor(hits.length / 2)].y;
  const scale = JET_LENGTH / Math.max(jetSize.x, jetSize.z);
  const noseAlongX = jetSize.x > jetSize.z;
  for (const h of hits) {
    if (Math.abs(h.y - median) > 1.5) continue;
    const a = jet.clone(true);
    a.scale.multiplyScalar(scale);
    a.rotation.y = h.ry + (noseAlongX ? Math.PI / 2 : 0);
    a.position.set(h.x, h.y, h.z);
    a.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    holder.add(a);
  }
}

/**
 * Non-interactive set dressing: the landing zone and the carrier offshore.
 * Objects pushed into `spinners` are rotated slowly by the world each frame.
 */
export function createDecor(data: MissionData, terrain: Terrain, spinners: THREE.Object3D[], assets: Assets, flames: THREE.Vector3[] = []): THREE.Group {
  const g = new THREE.Group();
  g.name = "decor";

  // Landing zone pad
  const lz = new THREE.Group();
  const y = terrain.heightAt(data.lz.x, data.lz.z);
  lz.position.set(data.lz.x, y + 0.05, data.lz.z);
  /**
   * Local height for anything standing away from the pad. The camp spreads
   * past the level part of its flat, so tents, crates and lights have to find
   * their own ground or they hang in the air over the slope.
   */
  const sit = (lx: number, lz2: number) => terrain.heightAt(data.lz.x + lx, data.lz.z + lz2) - y;
  const pad = new THREE.Mesh(new THREE.CircleGeometry(data.lz.r, 32), sharedMat(0x6d6a60, { roughness: 1 }));
  pad.rotation.x = -Math.PI / 2;
  pad.receiveShadow = true;
  lz.add(pad);
  const ring = new THREE.Mesh(new THREE.RingGeometry(data.lz.r - 1.2, data.lz.r, 32), new THREE.MeshBasicNodeMaterial({ color: 0xf2e6c0 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  lz.add(ring);
  const hMat = new THREE.MeshBasicNodeMaterial({ color: 0xf2e6c0 });
  for (const sx of [-3, 3]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 9), hMat);
    bar.rotation.x = -Math.PI / 2;
    bar.position.set(sx, 0.05, 0);
    lz.add(bar);
  }
  const mid = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.4), hMat);
  mid.rotation.x = -Math.PI / 2;
  mid.position.y = 0.05;
  lz.add(mid);
  // Tents, crates and a flag around the pad
  const tentModel = assets.get("tent");
  const tentSize = assets.size("tent");
  const tentScale = tentModel && tentSize ? TENT_WIDTH / Math.max(tentSize.x, tentSize.z) : 1;
  const tent = (x: number, z: number, rot: number) => {
    const t = new THREE.Group();
    if (tentModel) {
      const m = tentModel.clone(true);
      m.scale.multiplyScalar(tentScale);
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      t.add(m);
    } else {
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 3.2, 3, 4, 1), sharedMat(0x7d7a56));
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 1.5;
      roof.castShadow = true;
      t.add(roof);
    }
    t.position.set(x, sit(x, z), z);
    t.rotation.y = rot;
    return t;
  };
  // Two tidy rows facing each other across a street, clear of the pad, rather
  // than a random cluster.
  for (const [tx, tz, tr] of TENT_SPOTS) lz.add(tent(tx, tz, tr));
  const crateY = sit(18, -5);
  lz.add(box(2.5, 1.5, 1.8, 0x6b7a3d, 18, crateY + 0.75, -6), box(2.5, 1.5, 1.8, 0x6b7a3d, 18, crateY + 0.75, -3.5), box(2, 1.4, 1.6, 0x6b7a3d, 18.2, crateY + 2.2, -4.8));
  const flagY = sit(12, 14);
  lz.add(cylinder(0.1, 0.12, 9, 0x777777, 12, flagY + 4.5, 14, 6), box(3, 1.8, 0.1, 0x2c5ea0, 13.6, flagY + 8.2, 14));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), new THREE.MeshBasicNodeMaterial({ color: 0xffb060 }));
    const lx = Math.cos(a) * (data.lz.r + 2);
    const lzp = Math.sin(a) * (data.lz.r + 2);
    light.position.set(lx, sit(lx, lzp) + 0.4, lzp);
    lz.add(light);
  }
  g.add(lz);

  // Carrier offshore: the real model when it loaded, else a procedural stand-in.
  const carrierDef = data.spawns.find((s) => s.type === "carrier");
  if (carrierDef) {
    const model = assets.get("carrier");
    const size = assets.size("carrier");
    if (model && size) {
      // Scale to a length that reads against the 18 m helicopter, then sink the
      // hull so the waterline sits where it should rather than on the surface.
      const long = Math.max(size.x, size.z);
      model.scale.multiplyScalar(CARRIER_LENGTH / long);
      if (size.x > size.z) model.rotation.y += Math.PI / 2;
      model.position.y = -size.y * (CARRIER_LENGTH / long) * CARRIER_DRAFT;
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      const holder = new THREE.Group();
      holder.add(model);
      holder.name = "carrier";
      // Park aircraft while the holder is still at the origin, so the deck can
      // be found by casting straight down in the holder's own space.
      parkAircraft(holder, model, assets);
      holder.position.set(carrierDef.x, 0, carrierDef.z);
      holder.rotation.y = carrierDef.heading ?? 0;
      g.add(holder);
    } else {
      const { group, spinner } = createCarrier();
      group.position.set(carrierDef.x, 0, carrierDef.z);
      group.rotation.y = carrierDef.heading ?? 0;
      g.add(group);
      spinners.push(spinner);
    }
  }

  for (const item of data.decor ?? []) g.add(buildDecorItem(item, terrain, flames));

  return g;
}

/** Stone tones for the temple ruin. */
const STONE = 0x8d8a78;
const STONE_DARK = 0x6a675a;
const MOSS = 0x5f7a45;
/* Tropical village: weathered planking, mangrove poles, palm thatch and netting. */
const WOOD_PLANK = 0xb59468;
const POLE = 0x7d6242;
const THATCH = 0xc7a765;
const THATCH_DARK = 0x9a7f49;
const WALL_WOVEN = 0x8f7a5c;
const NET = 0x6d6a55;
/* A hull left on a reef long enough to go over entirely to rust. */
const HULL_RUST = 0x9c7052;
const HULL_BOOT = 0x4a352a;
const DECK_RUST = 0x53392a;
const FRAME_RUST = 0x5e4230;
/** Old topside paint, mostly weathered off. */
const HULL_PAINT = 0xc4bda6;

/**
 * A small open boat, used moored at a village pier and inside the pen. Built
 * from a tapered hull with a raised bow, a thwart and a stubby outboard.
 */
function skiff(b: Build, x: number, z: number, ry: number, scale = 1): void {
  const s = scale;
  b.box(1.7 * s, 0.9 * s, 5.2 * s, WOOD_PLANK, { x, y: 0.1 * s, z, ry, mat: { roughness: 1 } });
  b.box(1.5 * s, 0.3 * s, 4.6 * s, POLE, { x, y: 0.5 * s, z, ry, mat: { roughness: 1 } });
  b.cone(0.85 * s, 1.6 * s, WOOD_PLANK, { x: x + Math.sin(ry) * 3.1 * s, y: 0.25 * s, z: z + Math.cos(ry) * 3.1 * s, ry, rx: -Math.PI / 2, seg: 4, mat: { roughness: 1, flat: true } });
  b.box(1.5 * s, 0.22 * s, 0.5 * s, POLE, { x: x - Math.sin(ry) * 0.6 * s, y: 0.62 * s, z: z - Math.cos(ry) * 0.6 * s, ry });
  b.cyl(0.2 * s, 0.24 * s, 0.9 * s, P.metalDark, { x: x - Math.sin(ry) * 2.5 * s, y: 0.55 * s, z: z - Math.cos(ry) * 2.5 * s, ry, seg: 6 });
}

/**
 * Mission set dressing that is neither a target nor a pickup: a runway cut
 * into the canopy, a dam wall across the river, a temple ruin.
 */
function buildDecorItem(item: DecorItem, terrain: Terrain, flames: THREE.Vector3[]): THREE.Group {
  const b = new Build();
  // A dam stands in the channel and floes float, so those sit at the water line rather than the bed.
  const onWater =
    item.kind === "dam" || item.kind === "floes" || item.kind === "rig" || item.kind === "buoys" || item.kind === "village" || item.kind === "pen" || item.kind === "hulk";
  const y = onWater ? 0 : terrain.heightAt(item.x, item.z);
  switch (item.kind) {
    case "runway": {
      const len = item.length ?? 130;
      const wid = item.width ?? 18;
      b.box(wid, 0.3, len, 0x5c5a52, { y: 0.15, mat: { roughness: 1 } });
      // Centreline dashes, threshold bars, edge lights
      for (let z = -len / 2 + 8; z < len / 2 - 6; z += 9) b.box(0.6, 0.06, 4.5, P.white, { y: 0.33, z });
      for (const sz of [-1, 1]) {
        for (let i = -3; i <= 3; i++) b.box(1.2, 0.06, 6, P.white, { x: i * 2.2, y: 0.33, z: sz * (len / 2 - 5) });
        for (let z = -len / 2; z <= len / 2; z += 13) b.cyl(0.25, 0.25, 0.5, 0xffd27a, { x: sz * (wid / 2 + 1.2), y: 0.25, z, seg: 6, mat: { emissive: 0x6a5220 } });
      }
      // Apron and a windsock
      b.box(22, 0.28, 20, 0x635f56, { x: wid / 2 + 13, y: 0.14, z: -8, mat: { roughness: 1 } });
      b.cyl(0.1, 0.12, 6, P.metalDark, { x: -wid / 2 - 6, y: 3, z: len / 2 - 14, seg: 6 });
      b.cone(0.55, 2.6, P.hazard, { x: -wid / 2 - 6, y: 6, z: len / 2 - 12.8, rx: -Math.PI / 2 });
      break;
    }
    case "dam": {
      const len = item.length ?? 50;
      // Wall from the river bed to a crest 4 m over the water, with a walkway on top.
      b.box(len, 10.5, 4.6, P.concrete, { y: -1.2 });
      b.box(len, 1.0, 6.0, P.concreteDark, { y: 4.5 });
      // Spillway steps on the downstream face and buttresses
      for (let i = 0; i < 4; i++) b.box(len * 0.4, 0.9, 1.4, P.concreteShadow, { y: 3.0 - i * 1.1, z: 3.0 + i * 1.0 });
      for (let x = -len / 2 + 6; x < len / 2; x += 8) b.box(1.6, 9, 2.6, P.concreteDark, { x, y: -1.4, z: 3.4 });
      // Gate machinery on the crest and railings both sides
      for (let x = -len / 2 + 9; x < len / 2 - 4; x += 12) {
        b.box(2.2, 2.0, 2.2, P.metalDark, { x, y: 6.0, mat: { metalness: 0.4 } });
        b.cyl(0.9, 0.9, 1.0, P.steel, { x, y: 7.5, rz: Math.PI / 2, seg: 10, mat: { metalness: 0.5 } });
      }
      b.railing(len - 2, 1.1, P.steel, { y: 5.0, z: 2.8 });
      b.railing(len - 2, 1.1, P.steel, { y: 5.0, z: -2.8 });
      // Foam skirt at the toe
      b.box(len * 0.9, 0.2, 4, 0xd8e2d6, { y: 0.05, z: 6.0, mat: { roughness: 1 } });
      break;
    }
    case "floes": {
      // Slabs of sea ice scattered over open water inside the item's rectangle.
      const rng = new Random((item.x * 73856093) ^ (item.z * 19349663));
      const w = item.width ?? 120;
      const len = item.length ?? 400;
      const cosH = Math.cos(item.heading);
      const sinH = Math.sin(item.heading);
      let placed = 0;
      for (let tries = 0; tries < (item.count ?? 60) * 12 && placed < (item.count ?? 60); tries++) {
        const lx = rng.range(-w / 2, w / 2);
        const lz = rng.range(-len / 2, len / 2);
        const wx = item.x + lx * cosH + lz * sinH;
        const wz = item.z - lx * sinH + lz * cosH;
        if (terrain.heightAt(wx, wz) > -1.5) continue;
        const r = rng.range(3, 13);
        // Thick slabs with freeboard above the highest swell crest and a
        // skirt below the waterline, so waves lap the sides rather than wash over.
        b.cyl(r, r * 1.04, 1.5, rng.chance(0.6) ? 0xe9f0f4 : 0xd6e1e8, { x: lx, y: 0.45, z: lz, ry: rng.range(0, Math.PI), rx: rng.range(-0.02, 0.02), seg: rng.int(5, 7), mat: { roughness: 0.9, flat: true } });
        if (r > 8 && rng.chance(0.5)) b.cyl(r * 0.35, r * 0.4, 0.5, 0xf4f8fa, { x: lx + rng.range(-r, r) * 0.3, y: 1.4, z: lz + rng.range(-r, r) * 0.3, seg: 6, mat: { roughness: 0.9, flat: true } });
        placed++;
      }
      break;
    }
    case "crash": {
      // A four-engine transport that came down hard on the ice. Tapered
      // fuselage broken behind the wing, one wing still on with drooped
      // nacelles and bent props, the other torn off and flipped, T-tail
      // leaning, cargo ramp hanging open, and a skid trench behind it all.
      const skin = 0xb3b9bd;
      const belly = 0x8b9297;
      const torn = 0x2b2d2c;
      const stripe = 0x4a5a48;
      const snow = 0xf1f5f7;
      const metalOpts = { roughness: 0.55, metalness: 0.35 };
      const wingPlan = (root: number, tip: number, span: number, thick: number) => {
        // Planform in the XZ plane, extruded through Y for thickness; +X is outboard.
        const shape = new THREE.Shape();
        shape.moveTo(0, -root / 2);
        shape.lineTo(span, -tip / 2 - 0.6);
        shape.lineTo(span, tip / 2 - 0.6);
        shape.lineTo(0, root / 2);
        shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
        g.rotateX(Math.PI / 2);
        return g;
      };
      const fin = (rootChord: number, tipChord: number, height: number, thick: number) => {
        const shape = new THREE.Shape();
        shape.moveTo(-rootChord / 2, 0);
        shape.lineTo(rootChord / 2, 0);
        shape.lineTo(tipChord / 2 - 1.2, height);
        shape.lineTo(-tipChord / 2 - 1.2, height);
        shape.closePath();
        return new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
      };

      // Skid trench: the ground torn open, with berms of thrown snow either side
      b.box(7, 0.2, 52, 0x6b7176, { y: 0.02, z: -20, ry: 0.05, mat: { roughness: 1 } });
      for (let i = 0; i < 9; i++) {
        for (const side of [-1, 1]) b.box(2.2 + (i % 3) * 0.6, 0.7 + (i % 2) * 0.3, 5, snow, { x: side * (4.4 + (i % 2) * 0.5), y: 0.3, z: -42 + i * 5.2, ry: side * 0.15, mat: { roughness: 1, flat: true } });
      }
      // Snow thrown up against the nose where it stopped
      b.box(6, 1.2, 3, snow, { y: 0.5, z: 17.5, mat: { roughness: 1, flat: true } });

      // Forward fuselage: barrel, tapered nose with radome, cockpit glazing, cheek windows
      const roll = 0.16;
      b.cyl(2.3, 2.3, 13, skin, { y: 2.2, z: 5.5, rx: Math.PI / 2, rz: roll, seg: 18, mat: metalOpts });
      b.cyl(2.3, 2.3, 13.2, belly, { y: 2.15, z: 5.5, rx: Math.PI / 2, rz: roll, seg: 18, s: [1, 1, 0.999], mat: metalOpts });
      b.cyl(1.1, 2.3, 4.2, skin, { y: 2.45, z: 14.1, rx: Math.PI / 2, seg: 18, mat: metalOpts });
      b.sphere(1.1, torn, { y: 2.6, z: 16.2, mat: { roughness: 0.8 } });
      b.box(2.6, 0.9, 2.0, P.glass, { y: 3.85, z: 13.0, rx: -0.35, mat: { roughness: 0.25, metalness: 0.4 } });
      b.box(0.3, 0.9, 1.6, P.glass, { x: 1.35, y: 3.5, z: 12.6, mat: { roughness: 0.25, metalness: 0.4 } });
      b.box(0.3, 0.9, 1.6, P.glass, { x: -1.35, y: 3.5, z: 12.6, mat: { roughness: 0.25, metalness: 0.4 } });
      // Cheat line and a door
      b.box(4.75, 0.5, 12.6, stripe, { y: 2.9, z: 5.5, rz: roll, s: [1, 1, 1], mat: metalOpts });
      b.box(0.1, 1.9, 1.2, torn, { x: 2.33, y: 2.4, z: 9.0 });
      // Wing box and the high wing, port side still attached and drooped to the ice
      b.box(5.4, 1.3, 6.2, skin, { y: 4.1, z: 3.0, mat: metalOpts });
      b.add(wingPlan(5.6, 2.2, 17, 0.6), skin, { x: -1.5, y: 4.2, z: 3.0, ry: Math.PI, rz: -0.14, mat: metalOpts });
      b.add(wingPlan(5.6, 2.2, 17, 0.6), belly, { x: -1.5, y: 4.15, z: 3.0, ry: Math.PI, rz: -0.14, mat: metalOpts });
      // Two nacelles on the port wing with bent propeller blades
      for (const [ox, oy] of [
        [-6.5, 3.6],
        [-12.0, 2.85],
      ] as [number, number][]) {
        b.cyl(0.78, 0.9, 4.2, skin, { x: ox, y: oy, z: 4.4, rx: Math.PI / 2, seg: 12, mat: metalOpts });
        b.cone(0.55, 0.9, torn, { x: ox, y: oy, z: 6.9, rx: Math.PI / 2, seg: 10 });
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          const bend = k % 2 ? 0.7 : -0.4;
          b.box(0.28, 2.3, 0.08, torn, { x: ox + Math.sin(a) * 1.1, y: oy + Math.cos(a) * 1.1, z: 7.2, rz: -a + bend, rx: k % 2 ? 0.6 : -0.3 });
        }
      }
      // Starboard wing torn off at the root: a jagged stub, then the wing itself flipped 14 m away
      b.box(3.2, 0.6, 4.8, torn, { x: 3.6, y: 4.1, z: 3.0, ry: 0.12 });
      b.add(wingPlan(5.2, 2.2, 15, 0.6), belly, { x: 9, y: 0.45, z: -6, ry: 0.55, rz: 0.06, mat: metalOpts });
      b.add(wingPlan(5.2, 2.2, 15, 0.6), skin, { x: 9, y: 0.4, z: -6, ry: 0.55, rz: 0.06, mat: metalOpts });
      b.cyl(0.78, 0.9, 4.0, skin, { x: 14.5, y: 1.3, z: -4.2, rx: Math.PI / 2 + 0.5, ry: 0.55, seg: 12, mat: metalOpts });
      for (let k = 0; k < 4; k++) b.box(0.28, 2.2, 0.08, torn, { x: 16.2 + Math.sin(k) * 0.6, y: 1.2 + Math.cos(k * 1.6) * 0.9, z: -1.6, rz: k * 1.6 + 0.3, ry: 0.55 });
      // One engine ripped clear and rolling by itself
      b.cyl(0.78, 0.9, 4.0, skin, { x: 5.5, y: 0.85, z: -16, rz: Math.PI / 2, ry: 0.3, seg: 12, mat: metalOpts });

      // The break: exposed frames and dark interiors on both torn faces
      b.cyl(2.32, 2.32, 0.4, torn, { y: 2.2, z: -1.1, rx: Math.PI / 2, rz: roll, seg: 18, mat: { roughness: 1 } });
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 1.6 - 0.3;
        b.box(0.18, 0.18, 1.6 + (k % 3) * 0.5, torn, { x: Math.cos(a) * 2.25, y: 2.2 + Math.sin(a) * 2.25, z: -1.9, rx: 0.2 * (k % 3) });
      }
      // Aft fuselage: tapered, thrown off line, up-swept with the cargo ramp hanging
      const aft = { x: 1.9, z: -8.6, ry: 0.28, rz: -0.32 };
      b.cyl(1.6, 2.3, 11, skin, { x: aft.x, y: 2.05, z: aft.z, rx: Math.PI / 2 + 0.06, ry: aft.ry, rz: aft.rz, seg: 18, mat: metalOpts });
      b.cyl(1.6, 2.3, 11.1, belly, { x: aft.x, y: 2.0, z: aft.z, rx: Math.PI / 2 + 0.06, ry: aft.ry, rz: aft.rz, seg: 18, s: [1, 1, 0.999], mat: metalOpts });
      b.cyl(2.32, 2.32, 0.4, torn, { x: aft.x - Math.sin(aft.ry) * 5.5, y: 2.05, z: aft.z + Math.cos(aft.ry) * 5.5, rx: Math.PI / 2, ry: aft.ry, seg: 18, mat: { roughness: 1 } });
      b.box(3.2, 0.3, 4.4, belly, { x: aft.x + Math.sin(aft.ry) * 6.6, y: 0.9, z: aft.z - Math.cos(aft.ry) * 6.6, rx: 0.9, ry: aft.ry, mat: metalOpts });
      // T-tail: fin extruded and leaning, tailplane across the top
      b.add(fin(4.6, 2.6, 5.8, 0.5), skin, { x: aft.x + Math.sin(aft.ry) * 5.2, y: 3.0, z: aft.z - Math.cos(aft.ry) * 5.2, ry: aft.ry + Math.PI / 2, rz: -0.28, mat: metalOpts });
      b.add(fin(3.0, 1.6, 5.2, 0.4), skin, { x: aft.x + Math.sin(aft.ry) * 6.8, y: 8.4, z: aft.z - Math.cos(aft.ry) * 6.8, ry: aft.ry, rx: -Math.PI / 2 + 0.1, rz: -0.28, order: "YXZ", mat: metalOpts });
      b.add(fin(3.0, 1.6, 5.2, 0.4), skin, { x: aft.x + Math.sin(aft.ry) * 6.8, y: 8.4, z: aft.z - Math.cos(aft.ry) * 6.8, ry: aft.ry + Math.PI, rx: -Math.PI / 2 + 0.1, rz: 0.28, order: "YXZ", mat: metalOpts });

      // Spilled cargo: pallets, drums, crates and a torn cargo net, plus a scorched patch
      for (let i = 0; i < 6; i++) {
        const a = i * 1.1;
        b.box(1.6, 1.1, 1.3, i % 2 ? P.olive : P.oliveDark, { x: -3 + Math.cos(a) * 7 + i * 0.8, y: 0.55, z: -12 + Math.sin(a) * 5 - i, ry: a });
      }
      for (let i = 0; i < 5; i++) b.cyl(0.5, 0.5, 1.2, i % 2 ? P.hazard : P.rust, { x: 4 + Math.cos(i * 2.3) * 5, y: 0.5, z: -20 - i * 1.6, rx: Math.PI / 2, ry: i * 0.9, seg: 10 });
      for (let i = 0; i < 6; i++) b.box(1.5 + (i % 3) * 0.6, 0.12, 1.0, torn, { x: 2 + Math.cos(i * 2.1) * 9, y: 0.07, z: -24 - i * 2.4, ry: i * 0.7 });
      b.cyl(3.6, 3.6, 0.06, 0x24241f, { x: -11.5, y: 0.05, z: 4.6, seg: 14, mat: { roughness: 1 } });
      b.cyl(2.2, 2.2, 0.06, 0x24241f, { x: 5.5, y: 0.05, z: -16, seg: 12, mat: { roughness: 1 } });
      break;
    }
    case "rig": {
      // Offshore platform: four legs into the water, a two-level deck, derrick,
      // crane, accommodation block, helideck and a flare boom that burns.
      for (const [lx, lz] of [
        [-11, -9],
        [11, -9],
        [-11, 9],
        [11, 9],
      ] as [number, number][]) {
        b.cyl(1.4, 1.6, 20, P.concreteDark, { x: lx, y: 4, z: lz, seg: 12, mat: { roughness: 0.9 } });
        b.cyl(1.9, 1.9, 1.2, P.rust, { x: lx, y: 0.4, z: lz, seg: 12 });
      }
      for (const [ax, az, bx, bz] of [
        [-11, -9, 11, 9],
        [11, -9, -11, 9],
      ] as [number, number, number, number][]) {
        b.strut(new THREE.Vector3(ax, 1, az), new THREE.Vector3(bx, 12, bz), 0.3, P.rust, { metalness: 0.4 }, 6);
      }
      b.box(30, 1.6, 24, P.metalDark, { y: 14, mat: { metalness: 0.4 } });
      b.box(28, 1.2, 22, P.tarmac, { y: 15.4, mat: { roughness: 1 } });
      b.railing(30, 1.1, P.hazard, { y: 16, z: 12 });
      b.railing(30, 1.1, P.hazard, { y: 16, z: -12 });
      b.railing(24, 1.1, P.hazard, { x: 15, y: 16, ry: Math.PI / 2 });
      // Accommodation block and control room
      b.box(10, 6, 8, P.white, { x: -8, y: 19, z: 6, mat: { roughness: 0.6 } });
      b.box(10.4, 0.6, 8.4, P.metalDark, { x: -8, y: 22.3, z: 6 });
      for (let i = -1; i <= 1; i++) b.box(2.2, 1.2, 0.2, P.glass, { x: -8 + i * 3, y: 19.5, z: 10.1, mat: { roughness: 0.25, metalness: 0.35 } });
      // Derrick over the well
      b.latticeMast(22, 4.5, P.rust, { x: 6, y: 16, z: -3 });
      b.box(5, 1, 5, P.metalDark, { x: 6, y: 38.5, z: -3 });
      // Helideck on a cantilever, with the H
      b.cyl(7, 7, 0.6, P.metalDark, { x: -8, y: 23.5, z: -8, seg: 16 });
      b.torus(6.4, 0.18, P.white, { x: -8, y: 23.9, z: -8, rx: Math.PI / 2, seg: 20 });
      b.box(1.0, 0.1, 5, P.white, { x: -10, y: 23.85, z: -8 });
      b.box(1.0, 0.1, 5, P.white, { x: -6, y: 23.85, z: -8 });
      b.box(3, 0.1, 1.0, P.white, { x: -8, y: 23.85, z: -8 });
      // Crane and pipe deck clutter
      b.cyl(0.6, 0.8, 8, P.hazard, { x: 12, y: 20, z: 8, seg: 8 });
      b.box(0.5, 0.5, 14, P.hazard, { x: 12, y: 24, z: 1, rx: -0.35 });
      for (let i = 0; i < 4; i++) b.cyl(0.35, 0.35, 8, P.steel, { x: 2 + i * 0.9, y: 16.4, z: 6, rx: Math.PI / 2, seg: 8, mat: { metalness: 0.5 } });
      for (let i = 0; i < 3; i++) b.box(2.4, 2.4, 6, i % 2 ? P.hazard : P.olive, { x: -2 + i * 3, y: 17.2, z: -9 });
      // Flare boom reaching out over the water, burning at the tip
      b.box(0.5, 0.5, 26, P.rust, { x: 14, y: 20, z: -14, rx: -0.5 });
      b.cyl(0.3, 0.3, 3, P.metalDark, { x: 14, y: 27, z: -26.5, seg: 8 });
      flames.push(new THREE.Vector3(item.x + Math.cos(item.heading) * 14 + Math.sin(item.heading) * -26.5, 28.5, item.z - Math.sin(item.heading) * 14 + Math.cos(item.heading) * -26.5));
      break;
    }
    case "buoys": {
      // Channel markers either side of the lane: red cans to port, green cones to starboard, each with a light.
      const pts = item.points ?? [];
      const off = item.width ?? 26;
      let acc = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const ux = (bx - ax) / len;
        const uz = (bz - az) / len;
        for (let d = acc; d < len; d += 60) {
          const px = ax + ux * d - item.x;
          const pz = az + uz * d - item.z;
          for (const side of [-1, 1]) {
            const x = px + -uz * side * off;
            const z = pz + ux * side * off;
            const red = side < 0;
            b.cyl(1.1, 1.3, 1.6, red ? P.hazard : 0x2f9a4a, { x, y: 0.7, z, seg: 10 });
            if (red) b.cyl(1.1, 1.1, 0.4, red ? P.hazard : 0x2f9a4a, { x, y: 1.7, z, seg: 10 });
            else b.cone(1.0, 1.4, 0x2f9a4a, { x, y: 2.2, z, seg: 10 });
            b.cyl(0.08, 0.08, 1.6, P.metalDark, { x, y: 2.6, z, seg: 5 });
            b.sphere(0.25, red ? 0xff5040 : 0x60ff80, { x, y: 3.5, z, mat: { emissive: red ? 0xaa2010 : 0x20aa40 } });
          }
        }
        acc = ((acc - len) % 60 + 60) % 60;
      }
      break;
    }
    case "quay": {
      // Wharf along the shore: concrete apron, bollards, fenders, a crane, containers and fuel tanks.
      const len = item.length ?? 90;
      b.box(len, 2.6, 14, P.concreteDark, { y: 1.3, z: 0, mat: { roughness: 1 } });
      b.box(len, 0.3, 14.4, P.concrete, { y: 2.75, mat: { roughness: 1 } });
      b.box(len, 0.6, 0.6, P.hazard, { y: 2.9, z: 7.1 });
      for (let x = -len / 2 + 6; x < len / 2; x += 12) {
        b.cyl(0.5, 0.6, 1.2, P.metalDark, { x, y: 3.5, z: 6.2, seg: 10, mat: { metalness: 0.5 } });
        b.box(1.4, 2.0, 0.6, 0x1e1e1e, { x, y: 1.6, z: 7.5, mat: { roughness: 1 } });
      }
      for (let i = 0; i < 6; i++) b.box(6, 2.6, 2.4, [P.hazard, P.olive, 0x3a6ea5, P.rust, 0x8a3a8a, P.oliveDark][i], { x: -len / 2 + 10 + (i % 3) * 8, y: 4.2 + Math.floor(i / 3) * 2.6, z: -3, ry: 0.05 * i });
      b.cyl(3.5, 3.5, 6, P.white, { x: len / 2 - 12, y: 5.9, z: -3.5, seg: 16, mat: { roughness: 0.6 } });
      b.cyl(3.5, 3.5, 6, P.white, { x: len / 2 - 20, y: 5.9, z: -3.5, seg: 16, mat: { roughness: 0.6 } });
      // Portal crane
      for (const sx of [-4, 4]) b.box(1.2, 14, 1.2, P.hazard, { x: 12 + sx, y: 9.9, z: 2 });
      b.box(1.2, 1.2, 26, P.hazard, { x: 12, y: 17, z: 0 });
      b.box(12, 1.2, 1.2, P.hazard, { x: 12, y: 17, z: 2 });
      b.box(2.2, 2.2, 3, P.metalDark, { x: 12, y: 15.4, z: 8 });
      break;
    }
    case "ruin": {
      // Stepped stone platform with broken colonnade, a fallen lintel and a shrine.
      b.box(30, 1.2, 26, STONE_DARK, { y: 0.6, mat: { roughness: 1 } });
      b.box(22, 1.2, 18, STONE, { y: 1.8, mat: { roughness: 1 } });
      b.box(12, 1.0, 10, STONE_DARK, { y: 2.9, mat: { roughness: 1 } });
      for (let i = -3; i <= 3; i++) {
        for (const sz of [-1, 1]) {
          const broken = (i + sz + 7) % 3 === 0;
          const h = broken ? 2.2 + ((i + 5) % 3) * 0.6 : 6.5;
          b.cyl(0.55, 0.65, h, STONE, { x: i * 3.2, y: 2.4 + h / 2, z: sz * 7.2, seg: 8, mat: { roughness: 1 } });
          if (!broken) b.box(1.5, 0.5, 1.5, STONE_DARK, { x: i * 3.2, y: 2.4 + h + 0.25, z: sz * 7.2 });
        }
      }
      b.box(21, 0.7, 1.6, STONE_DARK, { y: 9.6, z: -7.2 });
      b.box(9, 0.7, 1.6, STONE_DARK, { x: -6, y: 9.6, z: 7.2 });
      // Fallen lintel and rubble on the steps
      b.box(7, 0.7, 1.5, STONE, { x: 6, y: 2.8, z: 9.6, ry: 0.4, rz: 0.12 });
      for (let i = 0; i < 9; i++) b.add(new THREE.DodecahedronGeometry(0.5 + (i % 4) * 0.25, 0), i % 2 ? STONE : STONE_DARK, { x: -14 + i * 3.3, y: 1.4, z: 12 + (i % 3) * 1.4, ry: i, mat: { flat: true } });
      // Shrine with a doorway, moss on the north faces
      b.box(6, 4.2, 5, STONE, { y: 5.5, mat: { roughness: 1 } });
      b.box(4.4, 1.6, 4.2, STONE_DARK, { y: 8.4, mat: { roughness: 1 } });
      b.box(1.8, 2.6, 0.4, 0x2a2a24, { y: 4.7, z: 2.55 });
      b.box(6.2, 1.2, 0.2, MOSS, { y: 6.6, z: -2.6, mat: { roughness: 1 } });
      b.box(22.2, 0.5, 0.2, MOSS, { y: 2.1, z: -9.1, mat: { roughness: 1 } });
      // Steps down the front
      for (let i = 0; i < 3; i++) b.box(8, 0.4, 1.4, STONE, { y: 0.2 + i * 0.4, z: 13.8 + (2 - i) * 1.4 });
      break;
    }

    case "village": {
      // Fishing village on stilts over the shallows: huts on pole clusters
      // either side of a plank walk, a pier out to water deep enough to moor
      // in, drying nets and a few skiffs. Laid out from a seeded RNG so the
      // spacing is irregular but the same every time the world is built.
      const rng = new Random((item.x * 73856093) ^ (item.z * 19349663));
      const huts = item.count ?? 9;
      const spread = item.width ?? 46;
      const len = item.length ?? 76;
      const deck = 2.6;
      // Main walk, on posts, running the length of the village.
      b.box(3, 0.25, len, WOOD_PLANK, { y: deck, mat: { roughness: 1 } });
      for (let z = -len / 2 + 2; z <= len / 2; z += 5.5) {
        for (const sx of [-1.2, 1.2]) b.cyl(0.2, 0.24, deck + 2.4, POLE, { x: sx, y: deck - 1.2, z, seg: 6, mat: { roughness: 1 } });
      }
      for (let i = 0; i < huts; i++) {
        const side = i % 2 ? 1 : -1;
        const z = -len / 2 + 6 + (i / Math.max(1, huts - 1)) * (len - 12) + rng.range(-2, 2);
        const x = side * (6 + rng.range(0, spread / 2 - 6));
        const w = rng.range(5, 7);
        const d = rng.range(5, 6.6);
        const floor = deck + rng.range(-0.35, 0.5);
        const ry = rng.range(-0.18, 0.18);
        // Pole cluster, platform, walls and a thatched hip roof.
        for (const [px, pz] of [
          [-w / 2 + 0.6, -d / 2 + 0.6],
          [w / 2 - 0.6, -d / 2 + 0.6],
          [-w / 2 + 0.6, d / 2 - 0.6],
          [w / 2 - 0.6, d / 2 - 0.6],
        ] as [number, number][]) {
          const wx = x + px * Math.cos(ry) - pz * Math.sin(ry);
          const wz = z + px * Math.sin(ry) + pz * Math.cos(ry);
          b.cyl(0.22, 0.28, floor + 2.6, POLE, { x: wx, y: floor - 1.3, z: wz, seg: 6, mat: { roughness: 1 } });
        }
        b.box(w, 0.3, d, WOOD_PLANK, { x, y: floor, z, ry, mat: { roughness: 1 } });
        b.box(w - 0.8, 2.6, d - 0.8, WALL_WOVEN, { x, y: floor + 1.45, z, ry, mat: { roughness: 1 } });
        b.box(1.1, 1.9, 0.2, 0x2a241c, { x, y: floor + 1.1, z: z + (d / 2 - 0.4), ry });
        // A four-sided cone is a square pyramid with its corners on the axes, so
        // it needs a quarter turn to sit square on the hut instead of diamond-wise.
        b.box(w + 0.7, 0.2, d + 0.7, THATCH_DARK, { x, y: floor + 2.8, z, ry, mat: { roughness: 1 } });
        b.cone((w + 0.7) * 0.72, 1.9, THATCH, { x, y: floor + 3.85, z, ry: ry + Math.PI / 4, seg: 4, mat: { roughness: 1, flat: true } });
        b.box(0.35, 0.22, d + 0.8, THATCH_DARK, { x, y: floor + 4.7, z, ry, mat: { roughness: 1 } });
        // Branch walk joining the hut to the main run.
        const gap = Math.abs(x) - w / 2;
        if (gap > 1) b.box(gap, 0.22, 1.6, WOOD_PLANK, { x: side * (Math.abs(x) - gap / 2 - w / 2 + 0.1), y: deck - 0.05, z, mat: { roughness: 1 } });
      }
      // Pier running out past the huts, with a hoist post and moored skiffs.
      const pier = len / 2 + 26;
      b.box(4, 0.28, 28, WOOD_PLANK, { y: deck, z: pier - 14, mat: { roughness: 1 } });
      for (let z = len / 2; z <= pier; z += 5) for (const sx of [-1.6, 1.6]) b.cyl(0.22, 0.26, deck + 3.2, POLE, { x: sx, y: deck - 1.6, z, seg: 6, mat: { roughness: 1 } });
      b.cyl(0.3, 0.34, 5, POLE, { x: 1.8, y: deck + 2.5, z: pier - 3, seg: 6 });
      b.box(2.6, 0.2, 0.2, POLE, { x: 0.7, y: deck + 4.9, z: pier - 3 });
      for (let i = 0; i < 3; i++) {
        const sx = i % 2 ? 1 : -1;
        const sz = len / 2 - 4 + i * 9;
        skiff(b, sx * 4.4, sz, sx * 1.5 + rng.range(-0.3, 0.3));
      }
      // Drying nets on frames at the shoreward end.
      for (let i = 0; i < 3; i++) {
        const nx = (i - 1) * 7;
        const nz = -len / 2 - 3;
        for (const sx of [-1, 1]) b.cyl(0.16, 0.2, 4.4, POLE, { x: nx + sx * 2.4, y: 1.6, z: nz, seg: 5 });
        b.box(5, 2.4, 0.12, NET, { x: nx, y: 2.6, z: nz, mat: { roughness: 1, side: THREE.DoubleSide } });
      }
      break;
    }

    case "pen": {
      // Submarine pen driven into the shore: massive slab roof on the inner
      // two thirds, an open channel at the mouth so the berth reads from the
      // air, blast walls flanking it and a boat lying alongside. The mouth
      // faces -Z before the item's heading.
      const len = item.length ?? 46;
      const wid = item.width ?? 30;
      const roof = 13;
      const half = wid / 2;
      const mouth = -len / 2;
      // Roof stops short of the mouth, leaving the front of the berth open.
      const roofFront = mouth + 15;
      for (const sx of [-1, 1]) {
        // Side wall the full length, inner quay ledge and fenders along it.
        b.box(5, roof + 1, len, P.concreteDark, { x: sx * (half + 2.5), y: (roof + 1) / 2 - 1, z: 0, mat: { roughness: 1 } });
        b.box(4, 1.6, len - 4, P.concrete, { x: sx * (half - 2), y: 0.8, z: 0, mat: { roughness: 1 } });
        for (let z = mouth + 5; z < len / 2 - 3; z += 7) b.cyl(0.35, 0.35, 1.2, 0x2a2723, { x: sx * (half - 4.1), y: 1.2, z, seg: 6, rz: Math.PI / 2 });
        // Bollards along the open part of the quay.
        for (let z = mouth + 4; z < roofFront; z += 6) b.cyl(0.3, 0.36, 1, P.metalDark, { x: sx * (half - 3.4), y: 2.1, z, seg: 6 });
      }
      // Back wall, roof slab over the inner berth, and its parapet.
      b.box(wid + 10, roof + 1, 5, P.concreteDark, { y: (roof + 1) / 2 - 1, z: len / 2 + 2.5, mat: { roughness: 1 } });
      b.box(wid + 10, 3.4, len / 2 - mouth / 2 - 15 + len / 2 + 5 - (len / 2 - roofFront), P.concrete, { y: roof + 1.7, z: (roofFront + len / 2 + 2.5) / 2, mat: { roughness: 1 } });
      // Mouth of the covered part: piers and a deep lintel, chamfered like an arch.
      for (const sx of [-1, 1]) {
        b.box(6, roof, 6, P.concreteShadow, { x: sx * (half - 2), y: roof / 2 - 1, z: roofFront, mat: { roughness: 1 } });
        // Angled blast wall running out from the open mouth.
        b.box(2.4, 7, 18, P.concreteDark, { x: sx * (half + 7), y: 2.5, z: mouth - 8, ry: sx * 0.32, mat: { roughness: 1 } });
      }
      b.box(wid - 4, 3.2, 7, P.concreteShadow, { y: roof - 2.6, z: roofFront, mat: { roughness: 1 } });
      b.box(wid - 9, 1.4, 7.4, P.concreteDark, { y: roof - 4.6, z: roofFront, mat: { roughness: 1 } });
      // Roof works: parapet, panel seams, crane rail, vent cowls, stair tower.
      const rz0 = roofFront + 3;
      const rz1 = len / 2 + 5;
      b.box(wid + 10, 1.3, 1, P.concreteDark, { y: roof + 4, z: rz1 });
      b.box(wid + 10, 1.3, 1, P.concreteDark, { y: roof + 4, z: rz0 });
      for (const sx of [-1, 1]) b.box(1, 1.3, rz1 - rz0, P.concreteDark, { x: sx * (half + 4.5), y: roof + 4, z: (rz0 + rz1) / 2 });
      for (let z = rz0 + 6; z < rz1; z += 9) b.box(wid + 8, 0.12, 0.5, P.concreteShadow, { y: roof + 3.46, z });
      for (const sx of [-1, 1]) b.box(0.6, 0.5, rz1 - rz0 - 4, P.rust, { x: sx * (half - 5), y: roof + 3.6, z: (rz0 + rz1) / 2, mat: { metalness: 0.4 } });
      b.box(7, 1.8, 4, P.metalDark, { x: -half + 6, y: roof + 4.4, z: rz0 + 7, mat: { metalness: 0.4 } });
      for (const [vx, vz] of [
        [half - 8, rz1 - 6],
        [half - 8, rz1 - 14],
        [-half + 7, rz1 - 5],
      ] as [number, number][]) {
        b.cyl(1.4, 1.6, 4, P.metalDark, { x: vx, y: roof + 5.2, z: vz, seg: 8 });
        b.cyl(1.9, 1.9, 0.5, P.metalDark, { x: vx, y: roof + 7.4, z: vz, seg: 8 });
      }
      b.box(5, 4.5, 5, P.concrete, { x: -half + 1, y: roof + 5.6, z: len / 2 - 4, mat: { roughness: 1 } });
      b.box(5.6, 0.5, 5.6, P.concreteDark, { x: -half + 1, y: roof + 8, z: len / 2 - 4 });
      b.box(3.4, 4, 0.4, P.rust, { y: 1, z: len / 2 - 0.2, mat: { metalness: 0.3 } });
      // A boat lying in the open part of the berth, where it can be seen.
      skiff(b, -half + 6, mouth + 8, 0.02, 2.3);
      break;
    }

    case "lighthouse": {
      // Tapered tower with a painted band, a railed gallery, a glazed lantern
      // room and a keeper's cottage tucked against the base.
      const h = item.length ?? 22;
      b.cyl(6.4, 7.6, 1.4, P.concreteShadow, { y: 0.7, seg: 14, mat: { roughness: 1 } });
      b.cyl(2.5, 4.2, h, P.white, { y: 1.4 + h / 2, seg: 14, mat: { roughness: 0.85 } });
      b.cyl(3.05, 3.35, h * 0.2, P.hazard, { y: 1.4 + h * 0.46, seg: 14, mat: { roughness: 0.85 } });
      for (let i = 0; i < 3; i++) b.box(0.9, 1.2, 0.25, P.glass, { y: 4 + i * (h / 3.4), z: 3.4 - i * 0.25, ry: i * 1.1, mat: { roughness: 0.3, metalness: 0.3 } });
      // Gallery: a deck ring, its underside brackets and a railing.
      const gy = 1.4 + h;
      b.cyl(4.2, 4.2, 0.4, P.concrete, { y: gy, seg: 14, mat: { roughness: 1 } });
      b.torus(4.1, 0.14, P.metalDark, { y: gy + 1.1, rx: Math.PI / 2, seg: 16 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        b.cyl(0.07, 0.07, 1.1, P.metalDark, { x: Math.cos(a) * 4.1, y: gy + 0.6, z: Math.sin(a) * 4.1, seg: 4 });
        b.box(0.3, 0.5, 0.9, P.concreteDark, { x: Math.cos(a) * 3, y: gy - 0.45, z: Math.sin(a) * 3, ry: -a });
      }
      // Lantern room and the lamp itself.
      b.cyl(2.5, 2.5, 3.4, P.glass, { y: gy + 1.9, seg: 12, mat: { roughness: 0.15, metalness: 0.4 } });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.cyl(0.12, 0.12, 3.4, P.metalDark, { x: Math.cos(a) * 2.45, y: gy + 1.9, z: Math.sin(a) * 2.45, seg: 4 });
      }
      b.sphere(1.25, 0xffe9a8, { y: gy + 2.1, seg: 10, mat: { emissive: 0xffcc55, roughness: 0.4 } });
      b.cone(2.9, 2.2, P.metalDark, { y: gy + 4.7, seg: 12, mat: { flat: true } });
      b.cyl(0.12, 0.12, 1.6, P.metalDark, { y: gy + 6.5, seg: 4 });
      // Keeper's cottage and the path to the door.
      b.box(9, 3.4, 6.4, P.white, { x: -8.5, y: 1.7, z: 3, ry: 0.16, mat: { roughness: 0.9 } });
      b.box(9.8, 0.5, 7.2, P.hazard, { x: -8.5, y: 3.6, z: 3, ry: 0.16, mat: { roughness: 0.9 } });
      b.cone(6.2, 2.2, P.roof, { x: -8.5, y: 4.8, z: 3, ry: Math.PI / 4, seg: 4, mat: { roughness: 1, flat: true } });
      b.box(1.1, 2, 0.3, P.woodDark, { x: -6, y: 1, z: 6.2, ry: 0.16 });
      for (let i = 0; i < 4; i++) b.box(2.4, 0.3, 1.1, P.concrete, { x: -4 + i * 1.2, y: 0.15, z: 5.4 - i * 0.4 });
      break;
    }

    case "hulk": {
      // A freighter driven onto the reef and left: broken-backed, listing,
      // derricks down, gone entirely to rust. The roll goes on the group so
      // the caller's heading still turns her about the vertical.
      const len = item.length ?? 54;
      const beam = 11.5;
      const gap = 5;
      const hull = (z0: number, z1: number, y: number, tilt: number) => {
        const l = z1 - z0;
        const zc = (z0 + z1) / 2;
        b.box(beam, 7.5, l, HULL_RUST, { y: y + 1.2, z: zc, rx: tilt, mat: { roughness: 0.95, flat: true } });
        b.box(beam + 0.6, 1.2, l, HULL_BOOT, { y: y - 2.4, z: zc, rx: tilt, mat: { roughness: 1 } });
        b.box(beam - 1.4, 0.5, l - 1, DECK_RUST, { y: y + 5, z: zc, rx: tilt, mat: { roughness: 1 } });
        // Bulwarks down each side, which is what makes a deck read as a deck.
        for (const sx of [-1, 1]) b.box(0.5, 1.3, l - 1, HULL_RUST, { x: sx * (beam / 2 - 0.3), y: y + 5.6, z: zc, rx: tilt, mat: { roughness: 0.95 } });
      };
      hull(-len / 2, -gap, 1.8, -0.07);
      hull(gap, len / 2 - 7, -1.1, 0.06);
      // Raked bow, forecastle and the stern counter.
      b.box(beam - 2.6, 7, 8, HULL_RUST, { y: 3, z: -len / 2 - 3, rx: -0.2, mat: { roughness: 0.95, flat: true } });
      b.cone(beam / 2 - 0.8, 6, HULL_RUST, { y: 2.9, z: -len / 2 - 6.5, rx: -Math.PI / 2, seg: 4, mat: { roughness: 0.95, flat: true } });
      b.box(beam - 1.6, 1.6, 7, DECK_RUST, { y: 6.3, z: -len / 2 + 3, rx: -0.07, mat: { roughness: 1 } });
      b.box(beam - 1.8, 6.5, 7, HULL_RUST, { y: -1.8, z: len / 2 - 4, rx: 0.14, mat: { roughness: 0.95, flat: true } });
      // Cargo hatches on the forward deck, one of them stove in.
      for (let i = 0; i < 2; i++) {
        const z = -len / 2 + 11 + i * 11;
        b.box(beam - 4, 0.9, 7, DECK_RUST, { y: 5.6 + i * 0.25, z, rx: -0.07, mat: { roughness: 1 } });
        b.box(beam - 5.4, 0.4, 5.6, i ? 0x2b2622 : HULL_RUST, { y: 6.1 + i * 0.25, z, rx: -0.07, mat: { roughness: 1 } });
      }
      // The break amidships: a torn deck edge each side and a few standing frames.
      for (let i = 0; i < 4; i++) {
        const t = (i / 3 - 0.5) * 2;
        b.box(0.7, 5.5 - Math.abs(t) * 1.8, 0.4, FRAME_RUST, { x: t * (beam / 2 - 1.2), y: 1.6 - Math.abs(t) * 0.5, z: -1 + i * 0.7, rz: t * 0.16, mat: { roughness: 1 } });
      }
      b.box(beam, 0.5, 3.4, FRAME_RUST, { y: 5.1, z: -gap - 0.8, rx: 0.42, mat: { roughness: 1 } });
      b.box(beam, 0.5, 3.4, FRAME_RUST, { y: 2.3, z: gap + 0.8, rx: -0.46, mat: { roughness: 1 } });
      // Deckhouse, bridge wings and funnel aft, all well gone.
      const dz = len / 2 - 13;
      b.box(9.5, 6, 8, P.white, { y: 3.1, z: dz, rx: 0.06, mat: { roughness: 1 } });
      b.box(beam + 2, 0.5, 2.2, P.white, { y: 5.9, z: dz - 3, rx: 0.06, mat: { roughness: 1 } });
      b.box(9.9, 0.6, 8.4, DECK_RUST, { y: 6.3, z: dz, rx: 0.06 });
      for (let i = -1; i <= 1; i++) b.box(1.7, 1.1, 0.25, 0x24292b, { x: i * 2.8, y: 4.2, z: dz - 4.1, rx: 0.06 });
      b.box(6, 3.4, 5, P.white, { y: 8, z: dz + 0.5, rx: 0.06, mat: { roughness: 1 } });
      b.cyl(1.9, 2.2, 6.5, HULL_RUST, { y: 11.4, z: dz + 1, rz: 0.12, seg: 10, mat: { roughness: 0.95 } });
      b.cyl(2.3, 2.3, 1, 0x2b2622, { y: 14.6, z: dz + 1, rz: 0.12, seg: 10 });
      // Collapsed derricks and the mast lying over the rail.
      b.strut(new THREE.Vector3(-1.5, 6.4, -len / 2 + 17), new THREE.Vector3(-8.5, 0.6, -len / 2 + 27), 0.38, FRAME_RUST, { roughness: 1 });
      b.strut(new THREE.Vector3(2, 5.2, dz - 7), new THREE.Vector3(9, 0.2, dz - 13), 0.38, FRAME_RUST, { roughness: 1 });
      b.cyl(0.55, 0.7, 8, FRAME_RUST, { x: -0.8, y: 8.6, z: -len / 2 + 16, rz: 0.1, seg: 6, mat: { roughness: 1 } });
      // What is left of her paint, and rust weeping down the topsides.
      for (const sx of [-1, 1]) {
        b.box(0.18, 2.2, 9, HULL_PAINT, { x: sx * (beam / 2 + 0.04), y: 3.4, z: -len / 2 + 8, rx: -0.07, mat: { roughness: 1 } });
        b.box(0.18, 1.6, 6, HULL_PAINT, { x: sx * (beam / 2 + 0.04), y: 0.6, z: dz - 2, rx: 0.06, mat: { roughness: 1 } });
      }
      // Rust weeping down the topsides.
      for (let i = 0; i < 6; i++) {
        const sx = i % 2 ? 1 : -1;
        b.box(0.2, 3.4, 1.6, HULL_BOOT, { x: sx * (beam / 2 + 0.05), y: 1.6, z: -len / 2 + 6 + i * 7, mat: { roughness: 1 } });
      }
      break;
    }
  }
  const g = b.finish();
  g.position.set(item.x, y, item.z);
  // A wreck lies over on its side. Rolling about the hull's own long axis has
  // to happen inside the heading, which the default XYZ euler order gives us.
  if (item.kind === "hulk") g.rotation.z = 0.3;
  g.rotation.y = item.heading;
  g.name = `decor-${item.kind}`;
  return g;
}
