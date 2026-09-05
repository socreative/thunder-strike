import * as THREE from "three/webgpu";
import { SimplexNoise } from "../core/Random";
import { clamp, smoothstep } from "../core/MathUtil";
import { balance } from "../data/balance";
import type { FlatSpot } from "../data/mission1";
import { createTerrainMaterial } from "./TerrainMaterial";

/**
 * Analytic heightfield: noise dunes, a coastline on the west and flattened
 * pads under each compound. The mesh samples the same function that gameplay
 * uses, so ground units always sit on the visible surface.
 */
export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly size = balance.map.size;
  private noise: SimplexNoise;
  private flats: Required<FlatSpot>[];

  constructor(seed: number, flats: FlatSpot[]) {
    this.noise = new SimplexNoise(seed);
    this.flats = flats.map((f) => ({ ...f, h: f.h ?? this.baseHeight(f.x, f.z) }));

    const segments = 220;
    const geo = new THREE.PlaneGeometry(this.size, this.size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.heightAt(x, z));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    this.mesh = new THREE.Mesh(geo, createTerrainMaterial());
    this.mesh.receiveShadow = true;
    this.mesh.name = "terrain";
  }

  private baseHeight(x: number, z: number): number {
    const n = this.noise;
    let h = 5 + 11 * n.fbm(x * 0.0038, z * 0.0038, 4) + 2.2 * n.fbm(x * 0.021 + 7, z * 0.021 - 3, 2);
    // long dune ridges
    h += 1.6 * Math.sin(x * 0.045 + n.noise2(z * 0.01, x * 0.005) * 3);
    h = Math.max(h, 1.5);
    // Coastline: land falls into the sea to the west.
    const sea = balance.map.seaEdgeX;
    const c = smoothstep(sea + 70, sea - 50, x);
    h = h * (1 - c) + -9 * c;
    return h;
  }

  heightAt(x: number, z: number): number {
    let h = this.baseHeight(x, z);
    for (const f of this.flats) {
      const dx = x - f.x;
      const dz = z - f.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > f.r) continue;
      const w = 1 - smoothstep(f.r * 0.55, f.r, d);
      h = h * (1 - w) + f.h * w;
    }
    return h;
  }

  /** True when the point is over open water. */
  isWater(x: number, z: number): boolean {
    return this.heightAt(x, z) < 0;
  }

  /** Approximate surface normal from finite differences. */
  normalAt(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const e = 1.5;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  /** Keep a point inside the playable square. */
  clampToMap(v: THREE.Vector3, margin = 10): void {
    const half = this.size / 2 - margin;
    v.x = clamp(v.x, -half, half);
    v.z = clamp(v.z, -half, half);
  }

  /** Pre-render a tiny overview used by the minimap. */
  renderOverview(resolution: number): ImageData {
    const img = new ImageData(resolution, resolution);
    const half = this.size / 2;
    for (let py = 0; py < resolution; py++) {
      for (let px = 0; px < resolution; px++) {
        const x = -half + (px / (resolution - 1)) * this.size;
        const z = -half + (py / (resolution - 1)) * this.size;
        const h = this.heightAt(x, z);
        const i = (py * resolution + px) * 4;
        if (h < 0) {
          img.data[i] = 28;
          img.data[i + 1] = 70;
          img.data[i + 2] = 92;
        } else {
          const t = clamp(h / 26, 0, 1);
          img.data[i] = 150 + t * 70;
          img.data[i + 1] = 120 + t * 60;
          img.data[i + 2] = 70 + t * 40;
        }
        img.data[i + 3] = 255;
      }
    }
    return img;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
