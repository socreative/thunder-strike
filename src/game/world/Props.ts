import * as THREE from "three/webgpu";
import { Random } from "../core/Random";
import type { FlatSpot } from "../data/mission1";
import type { Terrain } from "./Terrain";

/** Instanced rocks, shrubs and cacti scattered over open desert. */
export class Props {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];

  constructor(terrain: Terrain, flats: FlatSpot[], seed: number) {
    const rng = new Random(seed ^ 0x5eed);
    const half = terrain.size / 2 - 20;
    const dummy = new THREE.Object3D();

    const blocked = (x: number, z: number) => {
      for (const f of flats) {
        const dx = x - f.x;
        const dz = z - f.z;
        if (dx * dx + dz * dz < (f.r + 6) * (f.r + 6)) return true;
      }
      return false;
    };

    const scatter = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      count: number,
      scale: [number, number],
      sink: number,
      shadow: boolean,
    ) => {
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      let placed = 0;
      let tries = 0;
      while (placed < count && tries < count * 20) {
        tries++;
        const x = rng.range(-half, half);
        const z = rng.range(-half, half);
        const h = terrain.heightAt(x, z);
        if (h < 2.2 || blocked(x, z)) continue;
        const s = rng.range(scale[0], scale[1]);
        dummy.position.set(x, h - sink * s, z);
        dummy.rotation.set(rng.range(-0.15, 0.15), rng.range(0, Math.PI * 2), rng.range(-0.15, 0.15));
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mesh.setMatrixAt(placed, dummy.matrix);
        placed++;
      }
      mesh.count = placed;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      this.meshes.push(mesh);
      this.group.add(mesh);
    };

    const rockMat = new THREE.MeshStandardNodeMaterial({ color: 0x8b6f4e, roughness: 0.95, flatShading: true });
    scatter(new THREE.DodecahedronGeometry(1.4, 0), rockMat, 420, [0.6, 3.2], 0.35, true);

    const shrubMat = new THREE.MeshStandardNodeMaterial({ color: 0x6d7a3a, roughness: 1, flatShading: true });
    scatter(new THREE.IcosahedronGeometry(1, 0), shrubMat, 380, [0.7, 1.6], 0.3, false);

    // Cactus: a trunk with two arms, merged into one geometry.
    const cactusMat = new THREE.MeshStandardNodeMaterial({ color: 0x4f7f3e, roughness: 0.9 });
    const trunk = new THREE.CylinderGeometry(0.45, 0.55, 4.2, 7);
    trunk.translate(0, 2.1, 0);
    const armA = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 6);
    armA.rotateZ(Math.PI / 2);
    armA.translate(0.9, 2.2, 0);
    const armAUp = new THREE.CylinderGeometry(0.3, 0.3, 1.6, 6);
    armAUp.translate(1.7, 3.0, 0);
    const armB = new THREE.CylinderGeometry(0.28, 0.28, 1.4, 6);
    armB.rotateZ(Math.PI / 2);
    armB.translate(-0.7, 2.8, 0);
    const armBUp = new THREE.CylinderGeometry(0.28, 0.28, 1.3, 6);
    armBUp.translate(-1.3, 3.4, 0);
    const cactus = mergeGeometries([trunk, armA, armAUp, armB, armBUp]);
    scatter(cactus, cactusMat, 160, [0.7, 1.4], 0.05, true);
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}

/** Merge non-indexed geometries that share the standard attributes. */
function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => g.toNonIndexed());
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const p of parts) {
    const n = p.attributes.position.count;
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    uv.set(p.attributes.uv.array as Float32Array, o * 2);
    o += n;
    p.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}
