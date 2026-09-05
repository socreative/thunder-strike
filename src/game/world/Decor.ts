import * as THREE from "three/webgpu";
import { box, cylinder, sharedMat } from "../entities/Entity";
import type { MissionData } from "../data/mission1";
import type { Terrain } from "./Terrain";

/** Non-interactive set dressing: the landing zone and the carrier offshore. */
export function createDecor(data: MissionData, terrain: Terrain): THREE.Group {
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
  const tent = (x: number, z: number, rot: number) => {
    const t = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 3.2, 3, 4, 1), sharedMat(0x7d7a56));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 1.5;
    roof.castShadow = true;
    t.add(roof);
    t.position.set(x, 0, z);
    t.rotation.y = rot;
    return t;
  };
  lz.add(tent(-22, 6, 0.3), tent(-20, 14, -0.4), tent(-14, 20, 0.8));
  lz.add(box(2.5, 1.5, 1.8, 0x6b7a3d, 18, 0.75, -6), box(2.5, 1.5, 1.8, 0x6b7a3d, 18, 0.75, -3.5), box(2, 1.4, 1.6, 0x6b7a3d, 18.2, 2.2, -4.8));
  lz.add(cylinder(0.1, 0.12, 9, 0x777777, 12, 4.5, 14, 6), box(3, 1.8, 0.1, 0x2c5ea0, 13.6, 8.2, 14));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), new THREE.MeshBasicNodeMaterial({ color: 0xffb060 }));
    light.position.set(Math.cos(a) * (data.lz.r + 2), 0.4, Math.sin(a) * (data.lz.r + 2));
    lz.add(light);
  }
  g.add(lz);

  // Carrier offshore
  const carrierDef = data.spawns.find((s) => s.type === "carrier");
  if (carrierDef) {
    const c = new THREE.Group();
    c.position.set(carrierDef.x, 0, carrierDef.z);
    c.rotation.y = carrierDef.heading ?? 0;
    const hullMat = sharedMat(0x5b6068, { roughness: 0.7, metalness: 0.3 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(22, 7, 95), hullMat);
    hull.position.y = 2.5;
    hull.castShadow = true;
    hull.receiveShadow = true;
    c.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(30, 0.8, 100), sharedMat(0x3e4147, { roughness: 1 }));
    deck.position.y = 6.4;
    deck.receiveShadow = true;
    c.add(deck);
    const island = new THREE.Mesh(new THREE.BoxGeometry(6, 9, 16), hullMat);
    island.position.set(10, 11, -8);
    island.castShadow = true;
    c.add(island);
    c.add(cylinder(0.3, 0.4, 10, 0x8a8f96, 10, 20, -10, 6));
    c.add(box(1, 3, 6, 0x8a8f96, 10, 16.5, -12));
    // deck markings
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1, 90), new THREE.MeshBasicNodeMaterial({ color: 0xf0e8c8 }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(-4, 6.85, 0);
    c.add(stripe);
    for (let i = 0; i < 8; i++) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 6), new THREE.MeshBasicNodeMaterial({ color: 0xf0e8c8 }));
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(4, 6.85, -42 + i * 12);
      c.add(dash);
    }
    g.add(c);
  }

  return g;
}
