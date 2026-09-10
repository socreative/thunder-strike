import * as THREE from "three/webgpu";
import { mergeGeometries as mergeAddon } from "three/addons/utils/BufferGeometryUtils.js";
import { Random } from "../core/Random";
import type { Terrain } from "./Terrain";
import type { PropKind, PropTheme } from "./Theme";

/** A circle kept clear of vegetation. */
export interface Exclusion {
  x: number;
  z: number;
  r: number;
}

const tmpNormal = new THREE.Vector3();
const tmpColor = new THREE.Color();
const tmpMat = new THREE.Matrix4();
const tmpBase = new THREE.Matrix4();
const tmpPivot = new THREE.Matrix4();
const tmpTrans = new THREE.Matrix4();
const tmpAxis = new THREE.Vector3();

/** Radius of ground the downwash disturbs. */
const WASH_RADIUS = 26;
const SWAY_CELL = 16;

/** One instanced mesh whose instances can lean under the rotor wash. */
interface SwaySet {
  mesh: THREE.InstancedMesh;
  /** Resting matrices, copied once after placement. */
  base: Float32Array;
  /** Base-of-trunk world position per instance. */
  pos: Float32Array;
  maxTilt: number;
  cells: Map<number, number[]>;
  /** Instances currently leaning: index to current tilt. */
  leaning: Map<number, number>;
}

/**
 * Instanced vegetation and rocks scattered over open ground. One mesh per
 * kind, so a whole jungle costs a handful of draw calls.
 */
export class Props {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private swaySets: SwaySet[] = [];
  /** Development switch for measuring the cost of the downwash animation. */
  swayEnabled = true;

  constructor(terrain: Terrain, exclusions: Exclusion[], seed: number, theme: PropTheme) {
    const rng = new Random(seed ^ 0x5eed);
    const half = terrain.size / 2 - 20;
    const dummy = new THREE.Object3D();

    const blocked = (x: number, z: number) => {
      for (const f of exclusions) {
        const dx = x - f.x;
        const dz = z - f.z;
        if (dx * dx + dz * dz < f.r * f.r) return true;
      }
      return false;
    };

    for (const set of theme.sets) {
      const { geo, mat } = buildKind(set.kind);
      const mesh = new THREE.InstancedMesh(geo, mat, set.count);
      const bankMargin = set.bankMargin ?? theme.bankMargin;
      let placed = 0;
      let tries = 0;
      while (placed < set.count && tries < set.count * 20) {
        tries++;
        const x = rng.range(-half, half);
        const z = rng.range(-half, half);
        const h = terrain.heightAt(x, z);
        if (h < theme.minHeight || blocked(x, z)) continue;
        if (bankMargin > 0 && terrain.riverDistance(x, z) < bankMargin) continue;
        if (set.maxSlope !== undefined && terrain.normalAt(x, z, tmpNormal).y < set.maxSlope) continue;
        const s = rng.range(set.scale[0], set.scale[1]);
        dummy.position.set(x, h - set.sink * s, z);
        dummy.rotation.set(rng.range(-0.15, 0.15), rng.range(0, Math.PI * 2), rng.range(-0.15, 0.15));
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mesh.setMatrixAt(placed, dummy.matrix);
        if (set.tints) mesh.setColorAt(placed, tmpColor.setHex(set.tints[rng.int(0, set.tints.length - 1)]));
        placed++;
      }
      mesh.count = placed;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = set.castShadow;
      mesh.receiveShadow = true;
      mesh.name = `props-${set.kind}`;
      this.meshes.push(mesh);
      this.group.add(mesh);
      if (set.sway) this.swaySets.push(this.makeSwaySet(mesh, placed, set.sway));
    }
  }

  private makeSwaySet(mesh: THREE.InstancedMesh, count: number, maxTilt: number): SwaySet {
    const arr = mesh.instanceMatrix.array as Float32Array;
    const base = new Float32Array(arr.subarray(0, count * 16));
    const pos = new Float32Array(count * 3);
    const cells = new Map<number, number[]>();
    for (let i = 0; i < count; i++) {
      // Translation lives in the last column of the matrix.
      const x = base[i * 16 + 12];
      const y = base[i * 16 + 13];
      const z = base[i * 16 + 14];
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      const key = cellKey(x, z);
      const list = cells.get(key);
      if (list) list.push(i);
      else cells.set(key, [i]);
    }
    // The buffer is only ever partially rewritten from here on.
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return { mesh, base, pos, maxTilt, cells, leaning: new Map() };
  }

  /**
   * Lean vegetation away from the rotor wash centred at (x, z). Trees inside
   * the disc tip over by up to their set's maximum, shivering slightly, and
   * ease back upright once the aircraft has moved on. Only the touched
   * instances are re-uploaded.
   */
  sway(x: number, z: number, strength: number, time: number, dt: number): void {
    if (this.swaySets.length === 0 || !this.swayEnabled) return;
    const ease = 1 - Math.exp(-6 * dt);
    const relax = 1 - Math.exp(-3 * dt);
    const r2 = WASH_RADIUS * WASH_RADIUS;
    const cx0 = Math.floor((x - WASH_RADIUS) / SWAY_CELL);
    const cx1 = Math.floor((x + WASH_RADIUS) / SWAY_CELL);
    const cz0 = Math.floor((z - WASH_RADIUS) / SWAY_CELL);
    const cz1 = Math.floor((z + WASH_RADIUS) / SWAY_CELL);
    for (const set of this.swaySets) {
      const { pos, leaning } = set;
      // Anything in the disc wants to lean; anything leaning wants to stand up.
      const targets = new Map<number, number>();
      if (strength > 0.01) {
        for (let cx = cx0; cx <= cx1; cx++) {
          for (let cz = cz0; cz <= cz1; cz++) {
            const list = set.cells.get(cx * 73856093 + cz * 19349663);
            if (!list) continue;
            for (const i of list) {
              const dx = pos[i * 3] - x;
              const dz = pos[i * 3 + 2] - z;
              const d2 = dx * dx + dz * dz;
              if (d2 > r2) continue;
              const d = Math.sqrt(d2);
              // Strongest just outside the disc edge where the sheet hits, fading to the rim.
              const f = 1 - d / WASH_RADIUS;
              targets.set(i, set.maxTilt * strength * f * (0.55 + 0.45 * f) + Math.sin(time * 7 + i) * 0.05 * strength * f);
            }
          }
        }
      }
      for (const [i, tilt] of leaning) if (!targets.has(i)) targets.set(i, 0);
      for (const [i, target] of targets) {
        const cur = leaning.get(i) ?? 0;
        const next = cur + (target - cur) * (target > cur ? ease : relax);
        if (Math.abs(next) < 0.002 && target === 0) {
          this.writeInstance(set, i, 0, x, z);
          leaning.delete(i);
        } else {
          this.writeInstance(set, i, next, x, z);
          leaning.set(i, next);
        }
      }
    }
  }

  /** Rebuild one instance matrix as its resting pose rotated about the trunk base, away from (fx, fz). */
  private writeInstance(set: SwaySet, i: number, tilt: number, fx: number, fz: number): void {
    const attr = set.mesh.instanceMatrix;
    const arr = attr.array as Float32Array;
    if (tilt === 0) {
      arr.set(set.base.subarray(i * 16, i * 16 + 16), i * 16);
    } else {
      const px = set.pos[i * 3];
      const py = set.pos[i * 3 + 1];
      const pz = set.pos[i * 3 + 2];
      let dx = px - fx;
      let dz = pz - fz;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      // Leaning away from the aircraft: rotate about the horizontal axis perpendicular to that direction.
      tmpAxis.set(dz, 0, -dx);
      tmpBase.fromArray(set.base, i * 16);
      tmpPivot.makeRotationAxis(tmpAxis, tilt);
      // T(p) * R * T(-p) * Base: rotate the resting pose about the trunk base.
      tmpMat.makeTranslation(-px, -py, -pz);
      tmpMat.premultiply(tmpPivot);
      tmpMat.premultiply(tmpTrans.makeTranslation(px, py, pz));
      tmpMat.multiply(tmpBase);
      tmpMat.toArray(arr, i * 16);
    }
    attr.addUpdateRange(i * 16, 16);
    attr.needsUpdate = true;
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}

function cellKey(x: number, z: number): number {
  return Math.floor(x / SWAY_CELL) * 73856093 + Math.floor(z / SWAY_CELL) * 19349663;
}

/* Geometry per kind. Trees bake their part colours into a colour attribute. */

function buildKind(kind: PropKind): { geo: THREE.BufferGeometry; mat: THREE.Material } {
  switch (kind) {
    case "rock":
      return { geo: new THREE.DodecahedronGeometry(1.4, 0), mat: new THREE.MeshStandardNodeMaterial({ color: 0x8b6f4e, roughness: 0.95, flatShading: true }) };
    case "shrub":
      return { geo: new THREE.IcosahedronGeometry(1, 0), mat: new THREE.MeshStandardNodeMaterial({ color: 0x6d7a3a, roughness: 1, flatShading: true }) };
    case "cactus":
      return { geo: cactusGeometry(), mat: new THREE.MeshStandardNodeMaterial({ color: 0x4f7f3e, roughness: 0.9 }) };
    case "fern":
      return { geo: new THREE.IcosahedronGeometry(1, 0).scale(1, 0.55, 1).translate(0, 0.45, 0), mat: new THREE.MeshStandardNodeMaterial({ color: 0x2f6a2c, roughness: 1, flatShading: true }) };
    case "palm":
      return { geo: palmGeometry(), mat: new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }) };
    case "broadleaf":
      return { geo: broadleafGeometry(), mat: new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 1, flatShading: true }) };
  }
}

function cactusGeometry(): THREE.BufferGeometry {
  // Cactus: a trunk with two arms, merged into one geometry.
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
  return mergeGeometries([trunk, armA, armAUp, armB, armBUp]);
}

/** Tag every vertex of a geometry with one colour so parts can be merged into a single mesh. */
function tint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

function mergeColored(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeAddon(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** Coconut palm: a leaning tapered trunk, a crown of drooping fronds and a nut cluster. About 10 m tall. */
function palmGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.42, 9.6, 6, 3, true);
  trunk.translate(0, 4.8, 0);
  // Lean the trunk a little: shear the top by displacing upper vertices.
  const pos = trunk.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = (y / 9.6) ** 2;
    pos.setX(i, pos.getX(i) + k * 1.4);
  }
  trunk.computeVertexNormals();
  parts.push(tint(trunk, 0x6b4f2e));
  parts.push(tint(new THREE.SphereGeometry(0.5, 6, 5).translate(1.4, 9.7, 0), 0x5a3f22));
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + 0.3;
    const f = new THREE.ConeGeometry(0.95, 4.4, 4, 1, true);
    f.scale(1, 1, 0.28);
    // Cone points up along +Y; lay it outward and let the tip droop.
    f.translate(0, -2.2, 0);
    f.rotateX(-Math.PI / 2 - 0.55);
    f.rotateY(a);
    f.translate(1.4, 9.9, 0);
    parts.push(tint(f, i % 2 ? 0x3f7a2e : 0x4d8a36));
  }
  return mergeColored(parts);
}

/** Broadleaf tree: a straight trunk with three overlapping canopy lobes. About 9 m tall. */
function broadleafGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(tint(new THREE.CylinderGeometry(0.3, 0.55, 5.6, 6, 1, true).translate(0, 2.8, 0), 0x5e4630));
  parts.push(tint(new THREE.CylinderGeometry(0.12, 0.2, 2.2, 5, 1, true).rotateZ(0.7).translate(1.0, 5.6, 0.3), 0x5e4630));
  parts.push(tint(new THREE.IcosahedronGeometry(2.7, 1).translate(0, 6.6, 0), 0x2f6a2c));
  parts.push(tint(new THREE.IcosahedronGeometry(2.1, 1).translate(1.7, 5.9, 0.9), 0x3c7d33));
  parts.push(tint(new THREE.IcosahedronGeometry(2.2, 1).translate(-1.5, 6.1, -1.1), 0x356f2e));
  return mergeColored(parts);
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
