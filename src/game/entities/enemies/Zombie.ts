import * as THREE from "three/webgpu";
import { Entity, box, sharedMat } from "../Entity";
import { balance } from "../../data/balance";
import { Build } from "../../world/Detail";
import { leadTarget } from "./aim";

const S = balance.enemies.zombie;
const O = balance.enemies.zombieOfficer;
const tmpMuzzle = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
/** World time before which no zombie groans; shared so a horde does not stack voices. */
let nextGroanAt = 0;

/**
 * Risen soldier in a rotted field-grey uniform. Shambles toward the aircraft
 * and wades through the shallows, but can only claw at it while it hangs
 * slow and low enough to winch. The officer variant still has his rifle.
 */
export class Zombie extends Entity {
  private home = new THREE.Vector3();
  private wander = new THREE.Vector3();
  private t = Math.random() * 10;
  private legs: THREE.Mesh[] = [];
  private arms: THREE.Mesh[] = [];
  private grab = Math.random() * S.grabEvery;
  private reload = Math.random() * O.reload;
  /** Where in the ring around the aircraft this one heads for, so a horde fans out. */
  private readonly fan = Math.random() * Math.PI * 2;
  private readonly lurch = Math.random() * Math.PI * 2;

  constructor(readonly officer = false) {
    super();
    this.kind = "zombie";
    this.hp = this.maxHp = officer ? O.hp : S.hp;
    this.radius = S.radius;
    this.barHeight = 3.2;
    // Dozens of these are on the map and they die in a few rounds; the bar
    // pool and the minimap are kept for the officers.
    this.showHealthBar = officer;
    this.blip = officer;

    const uniform = officer ? 0x3a3d3a : 0x4f5548;
    const skin = 0x7f9a6a;
    const b = new Build();
    // Torso, a little hunched: the cylinder leans forward.
    b.cyl(0.4, 0.46, 1.3, uniform, { y: 1.25, rx: 0.18, seg: 8 });
    b.sphere(0.32, skin, { y: 2.16, z: 0.12, seg: 8 });
    if (officer) {
      // Peaked cap: a short drum with a brim forward.
      b.cyl(0.36, 0.34, 0.22, 0x2e312c, { y: 2.42, z: 0.1, seg: 10 });
      b.box(0.5, 0.05, 0.3, 0x1e201c, { y: 2.33, z: 0.4 });
      // Rifle held across the body.
      b.box(0.12, 0.12, 1.4, 0x222222, { x: 0.38, y: 1.5, z: 0.5 });
    } else {
      // Stahlhelm: a dome with a flared skirt all round.
      b.add(new THREE.SphereGeometry(0.38, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x3a3d36, { y: 2.22, z: 0.12 });
      b.cyl(0.46, 0.38, 0.14, 0x3a3d36, { y: 2.2, z: 0.12, rx: 0.12, seg: 10 });
    }
    this.object.add(b.finish());
    // Eyes: two glowing points, their own material so they read at a distance.
    const eyeMat = sharedMat(0xff2020, { emissive: 0xff2020, roughness: 1 });
    for (const sx of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.06), eyeMat);
      eye.position.set(sx, 2.2, 0.42);
      this.object.add(eye);
    }
    // Arms held out ahead, pivoted at the shoulder; legs pivoted at the hip.
    for (const sx of [-0.5, 0.5]) {
      const arm = box(0.2, 0.2, 1.1, uniform, sx, 1.85, 0);
      arm.geometry.translate(0, 0, 0.55);
      arm.rotation.x = -0.15;
      this.arms.push(arm);
      this.object.add(arm);
      const hand = box(0.16, 0.14, 0.2, skin, 0, 0, 1.15);
      arm.add(hand);
    }
    for (const sx of [-0.2, 0.2]) {
      const leg = box(0.26, 1.0, 0.26, officer ? 0x2e312c : 0x3f4a3a, sx, 0.5, 0);
      leg.geometry.translate(0, -0.5, 0);
      leg.position.y = 1.0;
      this.legs.push(leg);
      this.object.add(leg);
    }
  }

  onSpawn(): void {
    this.home.copy(this.pos);
    this.pickWander();
    this.settle();
  }

  private pickWander(): void {
    const a = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * 8;
    this.wander.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
  }

  /** Stand on the ground, or wade with the head above water where the ground is under it. */
  private settle(): void {
    this.pos.y = Math.max(this.world.terrain.heightAt(this.pos.x, this.pos.z), S.wadeDepth);
  }

  /**
   * Step toward a point at the shamble speed. Water too deep to wade blocks
   * the step; the walker tries a turn either way before giving up, which
   * keeps the horde off the boat channel and lets it feel its way round a
   * pool. Returns true when it moved.
   */
  private stepToward(tx: number, tz: number, dt: number): boolean {
    let dx = tx - this.pos.x;
    let dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.4) return false;
    dx /= dist;
    dz /= dist;
    const terrain = this.world.terrain;
    const step = S.speed * dt;
    const probe = 1.6;
    for (const turn of [0, 1.05, -1.05]) {
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      const rx = dx * c - dz * s;
      const rz = dx * s + dz * c;
      if (terrain.heightAt(this.pos.x + rx * probe, this.pos.z + rz * probe) < S.blockDepth) continue;
      this.pos.x += rx * step;
      this.pos.z += rz * step;
      this.object.rotation.y = Math.atan2(rx, rz);
      return true;
    }
    return false;
  }

  update(dt: number): void {
    const world = this.world;
    this.tickFlash(dt);
    this.t += dt;
    const heli = world.heli;
    const hunting = heli.alive && world.phase === "playing";
    const d = hunting ? this.distanceXZ(heli) : Infinity;
    let moving = false;
    if (d < S.sense) {
      // Close on a point a few metres from the aircraft rather than its
      // centre, each walker on its own bearing, so they ring it.
      const tx = heli.pos.x + Math.cos(this.fan) * 3;
      const tz = heli.pos.z + Math.sin(this.fan) * 3;
      if (d > S.grabRange * 0.6) moving = this.stepToward(tx, tz, dt);
      else this.object.rotation.y = Math.atan2(heli.pos.x - this.pos.x, heli.pos.z - this.pos.z);

      // Claw at the skids while it hangs slow enough to winch.
      this.grab -= dt;
      if (d < S.grabRange && heli.speed < balance.heli.winchMaxSpeed) {
        if (this.grab <= 0) {
          this.grab = S.grabEvery;
          heli.damage(S.grabDamage, this);
          heli.push(heli.pos.x - this.pos.x + (Math.random() - 0.5) * 2, heli.pos.z - this.pos.z + (Math.random() - 0.5) * 2, S.grabDamage * 2);
          world.audio.play("hit", this.pos);
          tmpMuzzle.set(heli.pos.x, heli.pos.y - 2.5, heli.pos.z);
          for (let i = 0; i < 3; i++) world.particles.spark(tmpMuzzle, 0xffb070);
        }
      } else if (this.grab < 0) {
        this.grab = 0;
      }

      if (this.officer && d < O.range) {
        this.reload -= dt;
        if (this.reload <= 0) {
          this.reload = O.reload + Math.random() * 0.8;
          tmpMuzzle.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
          leadTarget(tmpMuzzle, heli, balance.enemyShots.rifle.speed, tmpDir, 0.12);
          world.fire("rifle", tmpMuzzle, tmpDir, "enemy", this);
          world.audio.play("rifle", this.pos);
        }
      }

      if (d < 40 && world.time >= nextGroanAt && Math.random() < dt * 0.6) {
        nextGroanAt = world.time + 1.6 + Math.random() * 1.4;
        world.audio.play("groan", this.pos);
      }
    } else {
      const dx = this.wander.x - this.pos.x;
      const dz = this.wander.z - this.pos.z;
      if (Math.hypot(dx, dz) < 0.4) {
        if (Math.random() < 0.005) this.pickWander();
      } else {
        moving = this.stepToward(this.wander.x, this.wander.z, dt);
        if (!moving) this.pickWander();
      }
    }

    // Shamble: a slow, uneven gait, arms reaching, the whole body lurching.
    const swing = moving ? Math.sin(this.t * 5) * 0.45 : 0;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    const reach = d < S.sense ? -0.35 : -0.15;
    this.arms[0].rotation.x = reach + Math.sin(this.t * 2.3 + this.lurch) * 0.08;
    this.arms[1].rotation.x = reach + Math.cos(this.t * 2.1 + this.lurch) * 0.08;
    this.object.rotation.z = Math.sin(this.t * 2.5 + this.lurch) * 0.07;
    this.object.rotation.x = 0.12 + (moving ? Math.sin(this.t * 5) * 0.03 : 0);

    this.settle();
    this.syncObject();
    world.grid.update(this);
  }

  protected onDeath(source?: Entity): void {
    // Falls in the mud or the water; either way, no wreck.
    if (this.world.terrain.heightAt(this.pos.x, this.pos.z) < 0) this.world.particles.splash(this.pos, 0.8);
    else this.world.particles.dustHit(this.pos, 1.4);
    this.world.reportKill(this, source);
  }
}
