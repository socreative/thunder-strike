import type { Entity } from "../entities/Entity";

/** Uniform grid over the XZ plane for cheap circle queries. */
export class SpatialGrid {
  private cells = new Map<number, Set<Entity>>();
  private where = new Map<number, number>();
  private readonly half: number;

  constructor(
    private readonly size: number,
    private readonly cellSize: number,
  ) {
    this.half = size / 2;
  }

  private key(x: number, z: number): number {
    const cx = Math.floor((x + this.half) / this.cellSize);
    const cz = Math.floor((z + this.half) / this.cellSize);
    return cx * 100000 + cz;
  }

  insert(e: Entity): void {
    const k = this.key(e.pos.x, e.pos.z);
    let set = this.cells.get(k);
    if (!set) {
      set = new Set();
      this.cells.set(k, set);
    }
    set.add(e);
    this.where.set(e.id, k);
  }

  remove(e: Entity): void {
    const k = this.where.get(e.id);
    if (k === undefined) return;
    this.cells.get(k)?.delete(e);
    this.where.delete(e.id);
  }

  /** Re-bucket an entity if it moved to a different cell. */
  update(e: Entity): void {
    const k = this.key(e.pos.x, e.pos.z);
    const prev = this.where.get(e.id);
    if (prev === k) return;
    if (prev !== undefined) this.cells.get(prev)?.delete(e);
    let set = this.cells.get(k);
    if (!set) {
      set = new Set();
      this.cells.set(k, set);
    }
    set.add(e);
    this.where.set(e.id, k);
  }

  /** Collect entities whose circle intersects the query circle. */
  query(x: number, z: number, r: number, out: Entity[], filter?: (e: Entity) => boolean): Entity[] {
    out.length = 0;
    const pad = r + this.cellSize; // entities can be up to a cell wide
    const minCx = Math.floor((x - pad + this.half) / this.cellSize);
    const maxCx = Math.floor((x + pad + this.half) / this.cellSize);
    const minCz = Math.floor((z - pad + this.half) / this.cellSize);
    const maxCz = Math.floor((z + pad + this.half) / this.cellSize);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const set = this.cells.get(cx * 100000 + cz);
        if (!set) continue;
        for (const e of set) {
          if (!e.alive) continue;
          const dx = e.pos.x - x;
          const dz = e.pos.z - z;
          const rr = r + e.radius;
          if (dx * dx + dz * dz > rr * rr) continue;
          if (filter && !filter(e)) continue;
          out.push(e);
        }
      }
    }
    return out;
  }

  clear(): void {
    this.cells.clear();
    this.where.clear();
  }
}
