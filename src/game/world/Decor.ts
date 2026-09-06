import * as THREE from "three/webgpu";
import { box, cylinder, sharedMat } from "../entities/Entity";
import type { MissionData } from "../data/mission1";
import type { Terrain } from "./Terrain";
import { createCarrier } from "./Carrier";
import type { Assets } from "../core/Assets";

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
  // Row beside the flag at (12, 14), doors facing back down the camp street.
  [2, 23, Math.PI],
  [12, 23, Math.PI],
  [22, 23, Math.PI],
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
export function createDecor(data: MissionData, terrain: Terrain, spinners: THREE.Object3D[], assets: Assets): THREE.Group {
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

  return g;
}
