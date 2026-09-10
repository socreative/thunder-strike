import * as THREE from "three/webgpu";
import { SimplexNoise } from "../core/Random";
import { clamp, smoothstep } from "../core/MathUtil";
import { balance } from "../data/balance";
import type { FlatSpot } from "../data/mission";
import { createTerrainMaterial } from "./TerrainMaterial";
import type { GroundPalette, OverviewPalette } from "./Theme";

/** A river as a centreline with a half-width at each control point. */
export interface RiverDef {
  points: [x: number, z: number, halfWidth: number][];
  /** Depth of the channel floor below the water plane. */
  bed?: number;
  /** Width of the shoulder that blends the channel edge back into the land. */
  bank?: number;
}

export interface TerrainConfig {
  shape: "desert" | "jungle" | "arctic" | "gulf";
  /** Land falls into the sea west of this X, down to `floor`. */
  coast?: { edgeX: number; floor: number };
  river?: RiverDef;
  /** Land raised out of the water after the channel is cut. */
  islands?: { x: number; z: number; r: number; h: number }[];
}

export const DESERT_TERRAIN: TerrainConfig = { shape: "desert", coast: { edgeX: balance.map.seaEdgeX, floor: -9 } };

interface RiverSeg {
  ax: number;
  az: number;
  dx: number;
  dz: number;
  invLen2: number;
  wa: number;
  wb: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Nearest river point: signed distance from the channel edge (negative inside), its half-width and centreline point. */
export interface RiverHit {
  sd: number;
  w: number;
  cx: number;
  cz: number;
}

const tmpHit: RiverHit = { sd: Infinity, w: 0, cx: 0, cz: 0 };
/** Channel edge height: always under the water plane so the shoreline is smooth. */
const LIP = -0.8;

/**
 * Analytic heightfield: noise hills, an optional coastline or river, and
 * flattened pads under each compound. The mesh samples the same function that
 * gameplay uses, so ground units always sit on the visible surface.
 */
export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly size = balance.map.size;
  private noise: SimplexNoise;
  private flats: Required<FlatSpot>[];
  private readonly base: (x: number, z: number) => number;
  private segs: RiverSeg[] = [];
  private riverBed = -5;
  private riverBank = 14;

  constructor(
    seed: number,
    flats: FlatSpot[],
    private readonly cfg: TerrainConfig = DESERT_TERRAIN,
    ground: GroundPalette,
    private readonly overview: OverviewPalette,
  ) {
    this.noise = new SimplexNoise(seed);
    this.base = cfg.shape === "jungle" ? this.jungleHeight : cfg.shape === "arctic" ? this.arcticHeight : cfg.shape === "gulf" ? this.gulfHeight : this.desertHeight;
    if (cfg.river) {
      this.riverBed = cfg.river.bed ?? -5;
      this.riverBank = cfg.river.bank ?? 14;
      const pts = cfg.river.points;
      const pad = Math.max(...pts.map((p) => p[2])) + this.riverBank + 1;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az, wa] = pts[i];
        const [bx, bz, wb] = pts[i + 1];
        const dx = bx - ax;
        const dz = bz - az;
        this.segs.push({
          ax,
          az,
          dx,
          dz,
          invLen2: 1 / Math.max(1e-6, dx * dx + dz * dz),
          wa,
          wb,
          minX: Math.min(ax, bx) - pad,
          maxX: Math.max(ax, bx) + pad,
          minZ: Math.min(az, bz) - pad,
          maxZ: Math.max(az, bz) + pad,
        });
      }
    }
    this.flats = flats.map((f) => ({ ...f, h: f.h ?? this.base(f.x, f.z) }));
    if (process.env.NODE_ENV !== "production") {
      for (const f of this.flats) {
        const onIsland = cfg.islands?.some((i) => Math.hypot(f.x - i.x, f.z - i.z) < i.r);
        if (!onIsland && this.riverDistance(f.x, f.z) < f.r) console.warn(`[thunder-strike] flat at ${f.x},${f.z} overlaps the river`);
      }
    }

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

    this.mesh = new THREE.Mesh(geo, createTerrainMaterial(ground));
    this.mesh.receiveShadow = true;
    this.mesh.name = "terrain";
  }

  private desertHeight = (x: number, z: number): number => {
    const n = this.noise;
    let h = 5 + 11 * n.fbm(x * 0.0038, z * 0.0038, 4) + 2.2 * n.fbm(x * 0.021 + 7, z * 0.021 - 3, 2);
    // long dune ridges
    h += 1.6 * Math.sin(x * 0.045 + n.noise2(z * 0.01, x * 0.005) * 3);
    h = Math.max(h, 1.5);
    // Coastline: land falls into the sea to the west.
    const coast = this.cfg.coast;
    if (coast) {
      const sea = coast.edgeX;
      const c = smoothstep(sea + 70, sea - 50, x);
      h = h * (1 - c) + coast.floor * c;
    }
    return h;
  };

  private jungleHeight = (x: number, z: number): number => {
    const n = this.noise;
    // Rolling hills: lower frequency, no dune ridge, a little fine roughness.
    const h = 6 + 9 * n.fbm(x * 0.0045, z * 0.0045, 4) + 1.8 * n.fbm(x * 0.025 + 7, z * 0.025 - 3, 2);
    return Math.max(h, 1.5);
  };

  private arcticHeight = (x: number, z: number): number => {
    const n = this.noise;
    // Snowfields with hard pressure ridges: a folded noise term gives sharp crests.
    let h = 4 + 12 * n.fbm(x * 0.0035, z * 0.0035, 4) + 3 * Math.abs(n.noise2(x * 0.012 + 3, z * 0.012 - 5));
    h = Math.max(h, 1.2);
    const coast = this.cfg.coast;
    if (coast) {
      const c = smoothstep(coast.edgeX + 70, coast.edgeX - 50, x);
      h = h * (1 - c) + coast.floor * c;
    }
    return h;
  };

  private gulfHeight = (x: number, z: number): number => {
    const n = this.noise;
    // Steep arid coast: big folded ridges rising fast away from the water.
    const h = 5 + 16 * n.fbm(x * 0.003, z * 0.003, 4) + 4 * Math.abs(n.noise2(x * 0.011 - 2, z * 0.011 + 4));
    return Math.max(h, 1.5);
  };

  heightAt(x: number, z: number): number {
    let h = this.base(x, z);
    for (const f of this.flats) {
      const dx = x - f.x;
      const dz = z - f.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > f.r) continue;
      const w = 1 - smoothstep(f.r * 0.55, f.r, d);
      h = h * (1 - w) + f.h * w;
    }
    if (this.segs.length) h = this.carve(h, x, z);
    const islands = this.cfg.islands;
    if (islands) {
      for (const isl of islands) {
        const d = Math.hypot(x - isl.x, z - isl.z);
        if (d > isl.r) continue;
        // A rounded hump with a little noise so it is not a perfect cone.
        const k = 1 - smoothstep(isl.r * 0.45, isl.r, d);
        const bump = isl.h * k * (0.85 + 0.3 * this.noise.noise2(x * 0.05, z * 0.05));
        h = Math.max(h, bump);
      }
    }
    return h;
  }

  /**
   * Cut the river after the flats so a pad can never fill the channel. Inside
   * the channel the land is never consulted, so nothing pokes above the water.
   */
  private carve(h: number, x: number, z: number): number {
    const r = this.riverInfo(x, z, tmpHit);
    if (r.sd >= this.riverBank) return h;
    if (r.sd <= 0) return this.riverBed + (LIP - this.riverBed) * smoothstep(-r.w * 0.5, 0, r.sd);
    return LIP + (h - LIP) * smoothstep(0, this.riverBank, r.sd);
  }

  /** Nearest point on the river. Segments are exact capsules, so the min over them is the union. */
  riverInfo(x: number, z: number, out: RiverHit): RiverHit {
    out.sd = Infinity;
    for (const s of this.segs) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      let t = ((x - s.ax) * s.dx + (z - s.az) * s.dz) * s.invLen2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = s.ax + s.dx * t;
      const pz = s.az + s.dz * t;
      const w = s.wa + (s.wb - s.wa) * t;
      const sd = Math.hypot(x - px, z - pz) - w;
      if (sd < out.sd) {
        out.sd = sd;
        out.w = w;
        out.cx = px;
        out.cz = pz;
      }
    }
    return out;
  }

  /** Signed metres from the river's edge, negative inside; Infinity without a river. */
  riverDistance(x: number, z: number): number {
    return this.riverInfo(x, z, tmpHit).sd;
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
    const pal = this.overview;
    const put = (i: number, c: [number, number, number]) => {
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
    };
    const mixed: [number, number, number] = [0, 0, 0];
    const mix = (a: [number, number, number], b: [number, number, number], t: number) => {
      mixed[0] = a[0] + t * (b[0] - a[0]);
      mixed[1] = a[1] + t * (b[1] - a[1]);
      mixed[2] = a[2] + t * (b[2] - a[2]);
      return mixed;
    };
    for (let py = 0; py < resolution; py++) {
      for (let px = 0; px < resolution; px++) {
        const x = -half + (px / (resolution - 1)) * this.size;
        const z = -half + (py / (resolution - 1)) * this.size;
        const h = this.heightAt(x, z);
        const i = (py * resolution + px) * 4;
        if (h < 0) put(i, mix(pal.water, pal.shallow, smoothstep(-5, 0, h)));
        else if (pal.bank && h < 1.2) put(i, pal.bank);
        else put(i, mix(pal.landLow, pal.landHigh, clamp(h / 26, 0, 1)));
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
