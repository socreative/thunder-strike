import * as THREE from "three/webgpu";
import { box, cylinder, sharedMat } from "../entities/Entity";
import type { MissionData } from "../data/mission1";
import type { Terrain } from "./Terrain";
import { createCarrier } from "./Carrier";

/**
 * Non-interactive set dressing: the landing zone and the carrier offshore.
 * Objects pushed into `spinners` are rotated slowly by the world each frame.
 */
export function createDecor(data: MissionData, terrain: Terrain, spinners: THREE.Object3D[]): THREE.Group {
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
    const { group, spinner } = createCarrier();
    group.position.set(carrierDef.x, 0, carrierDef.z);
    group.rotation.y = carrierDef.heading ?? 0;
    g.add(group);
    spinners.push(spinner);
  }

  return g;
}
