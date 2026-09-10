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
    t.position.set(x, 0, z);
    t.rotation.y = rot;
    return t;
  };
  // Two tidy rows facing each other across a street, clear of the pad, rather
  // than a random cluster.
  for (const [tx, tz, tr] of TENT_SPOTS) lz.add(tent(tx, tz, tr));
  lz.add(box(2.5, 1.5, 1.8, 0x6b7a3d, 18, 0.75, -6), box(2.5, 1.5, 1.8, 0x6b7a3d, 18, 0.75, -3.5), box(2, 1.4, 1.6, 0x6b7a3d, 18.2, 2.2, -4.8));
  lz.add(cylinder(0.1, 0.12, 9, 0x777777, 12, 4.5, 14, 6), box(3, 1.8, 0.1, 0x2c5ea0, 13.6, 8.2, 14));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), new THREE.MeshBasicNodeMaterial({ color: 0xffb060 }));
    light.position.set(Math.cos(a) * (data.lz.r + 2), 0.4, Math.sin(a) * (data.lz.r + 2));
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

/**
 * Mission set dressing that is neither a target nor a pickup: a runway cut
 * into the canopy, a dam wall across the river, a temple ruin.
 */
function buildDecorItem(item: DecorItem, terrain: Terrain, flames: THREE.Vector3[]): THREE.Group {
  const b = new Build();
  // A dam stands in the channel and floes float, so those sit at the water line rather than the bed.
  const onWater = item.kind === "dam" || item.kind === "floes" || item.kind === "rig" || item.kind === "buoys";
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
        b.cyl(r, r * 1.04, 0.4, rng.chance(0.6) ? 0xe9f0f4 : 0xd6e1e8, { x: lx, y: 0.1, z: lz, ry: rng.range(0, Math.PI), rx: rng.range(-0.02, 0.02), seg: rng.int(5, 7), mat: { roughness: 0.9, flat: true } });
        if (r > 8 && rng.chance(0.5)) b.cyl(r * 0.35, r * 0.4, 0.5, 0xf4f8fa, { x: lx + rng.range(-r, r) * 0.3, y: 0.5, z: lz + rng.range(-r, r) * 0.3, seg: 6, mat: { roughness: 0.9, flat: true } });
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
  }
  const g = b.finish();
  g.position.set(item.x, y, item.z);
  g.rotation.y = item.heading;
  g.name = `decor-${item.kind}`;
  return g;
}
