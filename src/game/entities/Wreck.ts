import * as THREE from "three/webgpu";
import { Entity, sharedMat } from "./Entity";

export type WreckStyle = "vehicle" | "emplacement" | "rubble";

/** Charred remains left after a kill. Smokes for a while, then just sits there. */
export class Wreck extends Entity {
  private smokeTimer = 0;
  private smokeLeft: number;

  constructor(heading: number, size: number, style: WreckStyle) {
    super();
    this.kind = "wreck";
    this.team = "neutral";
    this.targetable = false;
    this.blip = false;
    this.radius = 0.1;
    this.smokeLeft = 14 + size * 3;
    this.object.rotation.y = heading;
    const mat = sharedMat(0x1f1d1a, { roughness: 1, flat: true });
    if (style === "vehicle") {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(size * 1.2, size * 0.5, size * 1.9), mat);
      hull.position.y = size * 0.25;
      hull.rotation.z = (Math.random() - 0.5) * 0.3;
      hull.castShadow = true;
      this.object.add(hull);
      const top = new THREE.Mesh(new THREE.DodecahedronGeometry(size * 0.45, 0), mat);
      top.position.set(size * 0.2, size * 0.6, -size * 0.2);
      top.castShadow = true;
      this.object.add(top);
    } else {
      const n = style === "rubble" ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(size * (0.25 + Math.random() * 0.3), 0), mat);
        chunk.position.set((Math.random() - 0.5) * size * 1.6, size * 0.15, (Math.random() - 0.5) * size * 1.6);
        chunk.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        chunk.castShadow = true;
        this.object.add(chunk);
      }
    }
    // Scorch mark
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(size * 1.6, 16), new THREE.MeshBasicNodeMaterial({ color: 0x1a1613, transparent: true, opacity: 0.6, depthWrite: false }));
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.08;
    this.object.add(scorch);
  }

  update(dt: number): void {
    if (this.smokeLeft <= 0) return;
    this.smokeLeft -= dt;
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.18;
      this.world.particles.burningSmoke(this.pos, 1.3);
    }
  }
}
