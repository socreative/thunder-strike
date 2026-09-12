import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { sharedVertexMat, type MatOpts } from "../entities/Entity";

export interface Place {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  /** Uniform or per-axis scale applied before placement. */
  s?: number | [number, number, number];
  /**
   * Euler order. The default XYZ applies `ry` before `rx`, so a part laid down
   * with `rx` ignores its heading; use "YXZ" to turn it after laying it down.
   */
  order?: THREE.EulerOrder;
  seg?: number;
  mat?: MatOpts;
}

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();

function matKey(o: MatOpts): string {
  return `${o.roughness ?? 0.8}|${o.metalness ?? 0.1}|${o.flat ? 1 : 0}|${o.emissive ?? 0}|${o.side ?? 0}`;
}

const tmpCol = new THREE.Color();

/**
 * Collects primitives and merges them into one mesh per material. A structure
 * can therefore carry a few hundred greebles and still cost a handful of draw
 * calls, which is what lets the ground models match the key art's fidelity.
 */
export class Build {
  private groups = new Map<string, { opts: MatOpts; geos: THREE.BufferGeometry[] }>();

  /** Add an arbitrary geometry. The builder takes ownership of it. */
  add(geo: THREE.BufferGeometry, color: number, p: Place = {}): this {
    const opts = p.mat ?? {};
    // Grouped by surface properties only. Colour rides along in the vertices,
    // so a model with thirty tints still merges into one mesh instead of
    // thirty, and that saving is paid again in every shadow cascade.
    const key = matKey(opts);
    let g = this.groups.get(key);
    if (!g) {
      g = { opts, geos: [] };
      this.groups.set(key, g);
    }
    const s = p.s ?? 1;
    tmpPos.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    tmpEuler.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0, p.order ?? "XYZ");
    tmpQuat.setFromEuler(tmpEuler);
    if (typeof s === "number") tmpScale.set(s, s, s);
    else tmpScale.set(s[0], s[1], s[2]);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    geo.applyMatrix4(tmpMatrix);
    if (!geo.index) {
      // Merging needs every geometry indexed or none; the primitives we use are.
      geo.setIndex(Array.from({ length: geo.attributes.position.count }, (_, i) => i));
    }
    // Merge needs a consistent attribute set.
    for (const name of Object.keys(geo.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") geo.deleteAttribute(name);
    }
    // `Color.setHex` converts out of sRGB, so these match what the material
    // would have produced from the same hex.
    tmpCol.setHex(color);
    const n = geo.attributes.position.count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      cols[i * 3] = tmpCol.r;
      cols[i * 3 + 1] = tmpCol.g;
      cols[i * 3 + 2] = tmpCol.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    g.geos.push(geo);
    return this;
  }

  box(w: number, h: number, d: number, color: number, p: Place = {}): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, p);
  }

  cyl(rTop: number, rBottom: number, h: number, color: number, p: Place = {}): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, p.seg ?? 10), color, p);
  }

  cone(r: number, h: number, color: number, p: Place = {}): this {
    return this.add(new THREE.ConeGeometry(r, h, p.seg ?? 8), color, p);
  }

  sphere(r: number, color: number, p: Place = {}): this {
    return this.add(new THREE.SphereGeometry(r, p.seg ?? 10, Math.max(4, Math.round((p.seg ?? 10) / 2))), color, p);
  }

  /** Open bowl, used for radar dishes. Needs a double-sided material. */
  bowl(r: number, color: number, depth = Math.PI / 3, p: Place = {}): this {
    const seg = p.seg ?? 16;
    return this.add(new THREE.SphereGeometry(r, seg, Math.round(seg / 2), 0, Math.PI * 2, 0, depth), color, {
      ...p,
      mat: { ...(p.mat ?? {}), side: THREE.DoubleSide },
    });
  }

  torus(r: number, tube: number, color: number, p: Place = {}): this {
    return this.add(new THREE.TorusGeometry(r, tube, 6, p.seg ?? 14), color, p);
  }

  /** A cylinder spanning two points, for pipes, struts and cables. */
  strut(from: THREE.Vector3, to: THREE.Vector3, r: number, color: number, opts: MatOpts = {}, seg = 6): this {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 1e-4) return this;
    const geo = new THREE.CylinderGeometry(r, r, len, seg);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(m);
    return this.add(geo, color, { mat: opts });
  }

  /**
   * A ring of individual sandbags, staggered row to row. This is the single
   * biggest fidelity win on emplacements: the key art shows discrete bags.
   */
  sandbagRing(radius: number, rows: number, color: number, opts: { y?: number; gap?: number; seed?: number; arc?: number; start?: number } = {}): this {
    const y0 = opts.y ?? 0;
    const arc = opts.arc ?? Math.PI * 2;
    const start = opts.start ?? 0;
    let seed = opts.seed ?? 1;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const bagW = 1.15;
    const bagH = 0.5;
    const bagD = 0.62;
    for (let row = 0; row < rows; row++) {
      const r = radius - row * 0.12;
      const count = Math.max(6, Math.round((arc * r) / bagW));
      const offset = row % 2 === 0 ? 0 : 0.5;
      for (let i = 0; i < count; i++) {
        if (arc < Math.PI * 2 - 0.01 && i === count - 1) continue;
        const a = start + ((i + offset) / count) * arc;
        const jitterY = (rnd() - 0.5) * 0.06;
        const jitterR = (rnd() - 0.5) * 0.12;
        this.box(bagW, bagH, bagD, color, {
          x: Math.cos(a) * (r + jitterR),
          y: y0 + bagH / 2 + row * (bagH * 0.92) + jitterY,
          z: Math.sin(a) * (r + jitterR),
          // Long axis along the tangent so the courses read as a wall.
          ry: -a - Math.PI / 2 + (rnd() - 0.5) * 0.16,
          s: [0.95 + rnd() * 0.12, 1, 0.92 + rnd() * 0.16],
          mat: { roughness: 1, flat: true },
        });
      }
    }
    return this;
  }

  /** A straight stack of sandbags, for blast walls beside doors and guns. */
  sandbagWall(length: number, rows: number, color: number, p: Place & { seed?: number } = {}): this {
    let seed = p.seed ?? 7;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const bagW = 1.15;
    const bagH = 0.5;
    const count = Math.max(2, Math.round(length / bagW));
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 === 0 ? 0 : 0.5;
      for (let i = 0; i < count; i++) {
        const t = ((i + offset) / count - 0.5) * length;
        this.box(bagW, bagH, 0.62, color, {
          x: (p.x ?? 0) + Math.cos(p.ry ?? 0) * t,
          y: (p.y ?? 0) + bagH / 2 + row * (bagH * 0.92) + (rnd() - 0.5) * 0.05,
          z: (p.z ?? 0) - Math.sin(p.ry ?? 0) * t,
          ry: (p.ry ?? 0) + (rnd() - 0.5) * 0.16,
          s: [0.95 + rnd() * 0.1, 1, 0.95],
          mat: { roughness: 1, flat: true },
        });
      }
    }
    return this;
  }

  /** Four-legged lattice mast with cross bracing. */
  latticeMast(height: number, width: number, color: number, p: Place = {}): this {
    const x0 = p.x ?? 0;
    const y0 = p.y ?? 0;
    const z0 = p.z ?? 0;
    const half = width / 2;
    const legR = width * 0.08;
    const corners: [number, number][] = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
    ];
    for (const [cx, cz] of corners) {
      this.cyl(legR, legR, height, color, { x: x0 + cx, y: y0 + height / 2, z: z0 + cz, seg: 5, mat: { metalness: 0.5, roughness: 0.6 } });
    }
    const bays = Math.max(2, Math.round(height / (width * 1.1)));
    for (let b = 0; b <= bays; b++) {
      const y = y0 + (b / bays) * height;
      // Horizontal frame
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i];
        const [bx, bz] = corners[(i + 1) % 4];
        this.strut(new THREE.Vector3(x0 + ax, y, z0 + az), new THREE.Vector3(x0 + bx, y, z0 + bz), legR * 0.6, color, { metalness: 0.5, roughness: 0.6 }, 4);
      }
      // Diagonal bracing on each face of the bay above
      if (b < bays) {
        const yTop = y0 + ((b + 1) / bays) * height;
        for (let i = 0; i < 4; i++) {
          const [ax, az] = corners[i];
          const [bx, bz] = corners[(i + 1) % 4];
          const flip = (b + i) % 2 === 0;
          const from = new THREE.Vector3(x0 + ax, flip ? y : yTop, z0 + az);
          const to = new THREE.Vector3(x0 + bx, flip ? yTop : y, z0 + bz);
          this.strut(from, to, legR * 0.5, color, { metalness: 0.5, roughness: 0.6 }, 4);
        }
      }
    }
    return this;
  }

  /** Posts and a top rail along a straight run. */
  railing(length: number, height: number, color: number, p: Place = {}): this {
    const posts = Math.max(2, Math.round(length / 1.8));
    const c = Math.cos(p.ry ?? 0);
    const s = Math.sin(p.ry ?? 0);
    for (let i = 0; i <= posts; i++) {
      const t = (i / posts - 0.5) * length;
      this.cyl(0.06, 0.06, height, color, { x: (p.x ?? 0) + c * t, y: (p.y ?? 0) + height / 2, z: (p.z ?? 0) - s * t, seg: 4, mat: { metalness: 0.4 } });
    }
    for (const h of [height, height * 0.55]) {
      this.box(length, 0.07, 0.07, color, { x: p.x ?? 0, y: (p.y ?? 0) + h, z: p.z ?? 0, ry: p.ry ?? 0, mat: { metalness: 0.4 } });
    }
    return this;
  }

  /** Ladder rails and rungs climbing in +Y, facing +Z. */
  ladder(height: number, width: number, color: number, p: Place = {}): this {
    const c = Math.cos(p.ry ?? 0);
    const s = Math.sin(p.ry ?? 0);
    for (const side of [-width / 2, width / 2]) {
      this.cyl(0.05, 0.05, height, color, { x: (p.x ?? 0) + c * side, y: (p.y ?? 0) + height / 2, z: (p.z ?? 0) - s * side, seg: 4, mat: { metalness: 0.5 } });
    }
    const rungs = Math.max(2, Math.round(height / 0.45));
    for (let i = 1; i < rungs; i++) {
      this.box(width, 0.05, 0.05, color, { x: p.x ?? 0, y: (p.y ?? 0) + (i / rungs) * height, z: p.z ?? 0, ry: p.ry ?? 0, mat: { metalness: 0.5 } });
    }
    return this;
  }

  /** Corrugated roof panel: a run of ridges along X, spanning Z. */
  corrugatedRoof(width: number, depth: number, color: number, p: Place = {}): this {
    const ribs = Math.max(4, Math.round(width / 0.7));
    const ribW = width / ribs;
    this.box(width, 0.12, depth, color, { x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0, ry: p.ry ?? 0, mat: p.mat });
    for (let i = 0; i < ribs; i++) {
      const t = (i + 0.5) / ribs - 0.5;
      const c = Math.cos(p.ry ?? 0);
      const s = Math.sin(p.ry ?? 0);
      this.cyl(ribW * 0.34, ribW * 0.34, depth, color, {
        x: (p.x ?? 0) + c * t * width,
        y: (p.y ?? 0) + 0.06,
        z: (p.z ?? 0) - s * t * width,
        rx: Math.PI / 2,
        ry: p.ry ?? 0,
        seg: 5,
        mat: p.mat,
      });
    }
    return this;
  }

  /** Coiled razor wire drawn as a run of thin rings. */
  razorWire(length: number, r: number, color: number, p: Place = {}): this {
    const coils = Math.max(2, Math.round(length / (r * 2.4)));
    const c = Math.cos(p.ry ?? 0);
    const s = Math.sin(p.ry ?? 0);
    for (let i = 0; i < coils; i++) {
      const t = ((i + 0.5) / coils - 0.5) * length;
      this.torus(r, 0.035, color, {
        x: (p.x ?? 0) + c * t,
        y: (p.y ?? 0) + r,
        z: (p.z ?? 0) - s * t,
        ry: (p.ry ?? 0) + Math.PI / 2,
        seg: 6,
        mat: { metalness: 0.6, roughness: 0.5 },
      });
    }
    return this;
  }

  /** Merge everything into one mesh per material and hand back a group. */
  finish(castShadow = true, receiveShadow = true): THREE.Group {
    const group = new THREE.Group();
    for (const g of this.groups.values()) {
      if (g.geos.length === 0) continue;
      const merged = g.geos.length === 1 ? g.geos[0] : mergeGeometries(g.geos, false);
      if (!merged) continue;
      if (g.geos.length > 1) for (const geo of g.geos) geo.dispose();
      const mesh = new THREE.Mesh(merged, sharedVertexMat(g.opts));
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    this.groups.clear();
    return group;
  }
}

/** Shared desert-installation palette, taken from the key art. */
export const PALETTE = {
  sandbag: 0xcbb98a,
  sandbagDark: 0xb3a276,
  concrete: 0xd6cbb0,
  concreteDark: 0xb3a88e,
  concreteShadow: 0x9a9078,
  roof: 0xa79d88,
  metal: 0x8a9084,
  metalDark: 0x4e544b,
  steel: 0xa9afa6,
  rust: 0x9a6438,
  olive: 0x7a8253,
  oliveDark: 0x59603c,
  glass: 0x35474f,
  /** Graded dirt hardstanding, not asphalt: a dark slab reads as a hole from the air. */
  tarmac: 0xa99974,
  wood: 0x9e7c50,
  woodDark: 0x6f5637,
  hazard: 0xc2512f,
  white: 0xe4e0d2,
} as const;
