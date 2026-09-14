import * as THREE from "three/webgpu";
import { Random } from "../core/Random";
import { balance } from "../data/balance";
import { Zombie } from "../entities/enemies/Zombie";
import type { World } from "../World";

const M = balance.enemies.marsh;
const Z = balance.enemies.zombie;

/** One patch of still water the mist lies on. */
interface Patch {
  x: number;
  z: number;
  /** Emission phase so patches do not all puff in step. */
  phase: number;
}

/** A pool starting to boil, about to give something up. */
interface Rise {
  patch: Patch;
  t: number;
}

/**
 * Mist over the pools, and the things in them. Patches are fixed points
 * chosen once from the heightfield wherever the water is shallow enough to
 * wade; those near the aircraft breathe mist in layers, and every so often
 * one of them boils for a couple of seconds and a walker comes up out of it.
 */
export class Marsh {
  private readonly patches: Patch[] = [];
  private readonly rng: Random;
  private readonly wind = new THREE.Vector2(0.4, 1).normalize();
  private readonly color: number;
  private readonly wispColor: number;
  private emitAcc = 0;
  private nextRise: number;
  private rise: Rise | null = null;
  private readonly raised: Zombie[] = [];
  private readonly risers: boolean;

  constructor(private readonly world: World) {
    const data = world.data;
    this.rng = new Random(data.seed ^ 0x3a5c);
    // Mist is darker than the distance haze: it lies in the shade of the
    // trees on black water, and a light sprite over dark ground reads as
    // smoke, not vapour.
    const shade = new THREE.Color(0x4a5a44);
    this.color = new THREE.Color(data.theme.fog.color).lerp(shade, 0.45).getHex();
    this.wispColor = new THREE.Color(data.theme.fog.color).lerp(shade, 0.22).getHex();
    this.risers = !!data.theme.ambient?.risers;
    this.nextRise = 6 + this.rng.range(0, 4);
    const w = data.theme.water;
    if (w.windDir) this.wind.set(w.windDir[0], w.windDir[1]).normalize();

    // Sample the map for wadeable water, well clear of the landing zone, and
    // keep the patches spread so the mist reads as pools rather than a haze.
    const half = world.terrain.size / 2 - 40;
    const lz = data.lz;
    for (let tries = 0; tries < 2600 && this.patches.length < 220; tries++) {
      const x = this.rng.range(-half, half);
      const z = this.rng.range(-half, half);
      const h = world.terrain.heightAt(x, z);
      if (h > -0.35 || h < Z.blockDepth) continue;
      if (Math.hypot(x - lz.x, z - lz.z) < M.lzClear) continue;
      let close = false;
      for (const p of this.patches) {
        if ((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < 14 * 14) {
          close = true;
          break;
        }
      }
      if (close) continue;
      this.patches.push({ x, z, phase: this.rng.range(0, 10) });
    }
  }

  get patchCount(): number {
    return this.patches.length;
  }

  update(dt: number): void {
    const world = this.world;
    const heli = world.heli;
    const fx = world.particles;
    const hx = heli.pos.x;
    const hz = heli.pos.z;
    const time = world.time;

    // Mist: patches within sight of the aircraft, emitting on a shared clock
    // so the cost is a handful of sprites a frame however many are in range.
    this.emitAcc += dt;
    if (this.emitAcc >= 0.08) {
      this.emitAcc = 0;
      for (const p of this.patches) {
        const d2 = (p.x - hx) * (p.x - hx) + (p.z - hz) * (p.z - hz);
        if (d2 > 150 * 150) continue;
        const beat = time * 1.1 + p.phase;
        // A sheet about every 0.9 s, a wisp about every 0.25 s, a strand now and then.
        if (Math.floor(beat / 1.0) !== Math.floor((beat - 0.088) / 1.0)) fx.mistSheet(p.x + this.rng.range(-6, 6), 0.3, p.z + this.rng.range(-6, 6), this.color, this.wind);
        if (this.rng.chance(0.18)) fx.mistWisp(p.x + this.rng.range(-7, 7), 0.4, p.z + this.rng.range(-7, 7), this.wispColor, this.wind);
        if (this.rng.chance(0.04)) fx.mistStrand(p.x + this.rng.range(-4, 4), 0.3, p.z + this.rng.range(-4, 4), this.wispColor);
        if (this.rng.chance(0.03)) fx.bubble(p.x + this.rng.range(-3, 3), p.z + this.rng.range(-3, 3), 0.3);
      }
    }

    if (!this.risers || world.phase !== "playing" || !heli.alive) return;

    // A boil in progress: thicker mist, bubbles quickening, a green light in it.
    if (this.rise) {
      const r = this.rise;
      r.t += dt;
      const k = Math.min(1, r.t / M.warn);
      if (Math.random() < dt * (8 + k * 24)) fx.bubble(r.patch.x + (Math.random() - 0.5) * 3.5, r.patch.z + (Math.random() - 0.5) * 3.5, 0.6 + k);
      if (Math.random() < dt * 8) fx.mistStrand(r.patch.x + (Math.random() - 0.5) * 3, 0.3, r.patch.z + (Math.random() - 0.5) * 3, this.wispColor);
      if (Math.random() < dt * 6) fx.wisp(tmp.set(r.patch.x + (Math.random() - 0.5) * 2.5, 0.6 + Math.random() * 1.5, r.patch.z + (Math.random() - 0.5) * 2.5));
      // Past halfway the surface heaves: rings of spray, and the water goes bright where it breaks.
      if (k > 0.45 && Math.random() < dt * 2.2) fx.splash(tmp.set(r.patch.x, 0, r.patch.z), 0.55 + k * 0.5);
      if (r.t >= M.warn) {
        this.rise = null;
        this.surface(r.patch);
      }
      return;
    }

    this.nextRise -= dt;
    if (this.nextRise > 0) return;
    this.nextRise = this.rng.range(M.riseEvery[0], M.riseEvery[1]);

    // Only while the aircraft is over the marsh and the dead are not already thick on the ground.
    for (let i = this.raised.length - 1; i >= 0; i--) if (!this.raised[i].alive) this.raised.splice(i, 1);
    if (this.raised.length >= M.maxAlive) return;
    let alive = 0;
    for (const e of world.entities) if (e.kind === "zombie" && e.alive) alive++;
    if (alive >= Z.maxAlive) return;
    if (Math.hypot(hx - world.data.lz.x, hz - world.data.lz.z) < M.lzClear) return;

    const near: Patch[] = [];
    for (const p of this.patches) {
      const d = Math.hypot(p.x - hx, p.z - hz);
      if (d >= M.near[0] && d <= M.near[1]) near.push(p);
    }
    if (near.length === 0) return;
    this.rise = { patch: near[this.rng.int(0, near.length - 1)], t: 0 };
  }

  private surface(p: Patch): void {
    const world = this.world;
    const z = new Zombie(false);
    z.pos.set(p.x, world.terrain.heightAt(p.x, p.z), p.z);
    world.add(z);
    z.emerge();
    this.raised.push(z);
    world.particles.splash(z.pos, 1.1);
    world.audio.play("groan", z.pos);
  }
}

const tmp = new THREE.Vector3();
