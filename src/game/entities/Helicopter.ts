import * as THREE from "three/webgpu";
import { Entity, box, cylinder, sharedMat } from "./Entity";
import { balance } from "../data/balance";
import { clamp, damp } from "../core/MathUtil";
import type { WeaponId } from "../core/Store";
import type { Pickup } from "./Pickup";
import type { Pow } from "./Pow";
import { createRotorDisc, findRotorsByShape, splitRotorFromModel } from "../fx/Rotor";
import { Flare } from "./Flare";

const H = balance.heli;
const W = balance.weapons;
const WEAPON_ORDER: WeaponId[] = ["gun", "hydra", "hellfire"];

const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpMuzzle = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const nearby: Entity[] = [];

export class Helicopter extends Entity {
  heading = 0;
  readonly vel = new THREE.Vector3();
  fuel = H.fuelMax;
  ammo: Record<WeaponId, number> = { gun: W.gun.ammo, hydra: W.hydra.ammo, hellfire: W.hellfire.ammo };
  weapon: WeaponId = "gun";
  passengers = 0;
  speed = 0;
  flares = H.flares;
  private flareCooldown = 0;

  private cooldown = 0;
  private bank = 0;
  private pitch = 0;
  private bob = 0;
  private washCarry = 0;
  /** Attitude jolt from a hit, decaying back to level. */
  private kickPitch = 0;
  private kickBank = 0;
  private spinners: { obj: THREE.Object3D; axis: "x" | "y"; mul: number }[] = [];
  private body = new THREE.Group();
  private gunSide = 1;

  // winch
  winchTarget: Pickup | Pow | null = null;
  winchProgress = 0;
  private unloadTimer = 0;
  atLZ = false;
  private rope: THREE.Line;
  private ropeGeo: THREE.BufferGeometry;
  hydraSide = 1;

  constructor() {
    super();
    this.kind = "helicopter";
    this.team = "player";
    this.radius = H.radius;
    this.hp = this.maxHp = H.armorMax;
    this.blip = false;
    this.showHealthBar = false;
    this.object.add(this.body);

    this.ropeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]);
    const ropeMat = new THREE.LineBasicNodeMaterial({ color: 0x222222 });
    this.rope = new THREE.Line(this.ropeGeo, ropeMat);
    this.rope.visible = false;
    this.rope.frustumCulled = false;
  }

  onSpawn(): void {
    this.buildModel();
    this.world.scene.add(this.rope);
  }

  private buildModel(): void {
    const asset = this.world.assets.get("helicopter");
    if (asset) {
      // Scale the model to roughly 18 metres long.
      const size = this.world.assets.size("helicopter")!;
      const s = 18 / Math.max(size.x, size.z);
      asset.scale.multiplyScalar(s);
      // Long axis should be Z: rotate if the model is longer in X.
      if (size.x > size.z) asset.rotation.y += Math.PI / 2;
      // Assets rest models on y = 0; drop it so the origin sits at the fuselage
      // rather than the skids, whatever the model's proportions.
      asset.position.y = -size.y * s * 0.42;
      this.body.add(asset);
      // Named parts first, then shape, then carving a single-mesh model apart.
      asset.traverse((o) => {
        const n = o.name.toLowerCase();
        if (n.includes("rotor") || n.includes("blade") || n.includes("prop")) {
          this.spinners.push({ obj: o, axis: n.includes("tail") ? "x" : "y", mul: n.includes("tail") ? 2.4 : 1 });
        }
      });
      if (this.spinners.length === 0) {
        for (const r of findRotorsByShape(asset)) {
          this.spinners.push({ obj: r.pivot, axis: "y", mul: r.tail ? 2.4 : 1 });
        }
      }
      if (this.spinners.length === 0) {
        const split = splitRotorFromModel(asset);
        if (split) {
          this.spinners.push({ obj: split.pivot, axis: "y", mul: 1 });
        } else {
          const rotor = this.buildRotor(7.5);
          rotor.position.y = 1.8;
          this.body.add(rotor);
          this.spinners.push({ obj: rotor, axis: "y", mul: 1 });
        }
      }
      return;
    }

    const olive = 0x596b45;
    const dark = 0x2f3a2a;
    const b = this.body;
    b.add(box(2.4, 2.1, 6.6, olive, 0, 0, 0.2));
    b.add(box(1.8, 1.5, 2.2, olive, 0, -0.2, 4.2)); // nose
    b.add(box(1.5, 1.0, 2.6, 0x203040, 0, 1.15, 1.6)); // canopy
    b.add(box(0.8, 0.8, 6.5, olive, 0, 0.45, -6.2)); // tail boom
    b.add(box(0.25, 2.4, 1.6, olive, 0, 1.6, -9.2)); // fin
    b.add(box(3.0, 0.2, 1.0, olive, 0, 0.9, -8.6)); // stabiliser
    b.add(box(7.0, 0.28, 1.5, dark, 0, -0.4, 0.6)); // stub wings
    for (const sx of [-1, 1]) {
      const pod = cylinder(0.55, 0.55, 2.6, 0x444a40, sx * 3.0, -0.95, 0.8, 10);
      pod.rotation.x = Math.PI / 2;
      b.add(pod);
      const skid = box(0.25, 0.25, 5.5, dark, sx * 1.2, -1.75, 0.4);
      b.add(skid);
      b.add(box(0.2, 0.8, 0.2, dark, sx * 1.2, -1.35, 2.2));
      b.add(box(0.2, 0.8, 0.2, dark, sx * 1.2, -1.35, -1.6));
    }
    const gun = cylinder(0.18, 0.18, 2.2, dark, 0, -1.25, 4.6, 8);
    gun.rotation.x = Math.PI / 2;
    b.add(gun);
    b.add(cylinder(0.4, 0.4, 0.5, dark, 0, -1.2, 3.6, 8));
    const mast = cylinder(0.3, 0.35, 1.1, dark, 0, 1.75, 0.2, 8);
    b.add(mast);
    const rotor = this.buildRotor(7.6);
    rotor.position.set(0, 2.3, 0.2);
    b.add(rotor);
    this.spinners.push({ obj: rotor, axis: "y", mul: 1 });
    const tail = new THREE.Group();
    tail.position.set(0.55, 1.4, -9.3);
    for (let i = 0; i < 2; i++) {
      const blade = box(0.12, 2.6, 0.3, dark);
      blade.rotation.x = (i * Math.PI) / 2;
      tail.add(blade);
    }
    b.add(tail);
    this.spinners.push({ obj: tail, axis: "x", mul: 2.4 });
  }

  private buildRotor(radius: number): THREE.Group {
    const g = new THREE.Group();
    g.add(cylinder(0.5, 0.5, 0.4, 0x222222, 0, 0, 0, 8));
    const bladeMat = sharedMat(0x1e211e, { roughness: 0.6 }).clone();
    bladeMat.transparent = true;
    bladeMat.opacity = 0.7;
    bladeMat.depthWrite = false;
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, radius), bladeMat);
      blade.position.z = radius / 2;
      blade.castShadow = true;
      const pivot = new THREE.Group();
      pivot.rotation.y = (i * Math.PI) / 2;
      pivot.add(blade);
      g.add(pivot);
    }
    const disc = createRotorDisc(radius);
    disc.position.y = -0.1;
    g.add(disc);
    return g;
  }

  /** Reset for a fresh life at the base. */
  respawn(x: number, z: number, heading: number): void {
    this.alive = true;
    this.hp = this.maxHp;
    this.fuel = H.fuelMax;
    this.ammo = { gun: W.gun.ammo, hydra: W.hydra.ammo, hellfire: W.hellfire.ammo };
    this.flares = H.flares;
    this.passengers = 0;
    this.vel.set(0, 0, 0);
    this.heading = heading;
    this.pos.set(x, this.world.terrain.heightAt(x, z) + H.hoverHeight, z);
    this.winchTarget = null;
    this.winchProgress = 0;
    this.object.visible = true;
    this.syncObject();
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  update(dt: number): void {
    if (!this.alive) return;
    const world = this.world;
    const input = world.input;
    this.tickFlash(dt);

    // Controls
    // Keyboard gives whole steps; the touch stick blends in analog values.
    let move = input.axis("move");
    let turn = input.axis("turn");
    const strafe = input.axis("strafe");
    const stick = input.stick;
    const stickMag = Math.hypot(stick.x, stick.y);
    if (stickMag > 0) {
      // The stick points where the aircraft should go on screen. Screen up is
      // away from the camera, so rotate by the fixed camera yaw into the world,
      // then turn toward that heading and only thrust once roughly aligned.
      const yaw = balance.camera.yaw;
      const dx = Math.cos(yaw) * stick.x - Math.sin(yaw) * stick.y;
      const dz = -Math.sin(yaw) * stick.x - Math.cos(yaw) * stick.y;
      let diff = Math.atan2(dx, dz) - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      turn = clamp(turn + clamp(diff / 0.45, -1, 1), -1, 1);
      move = clamp(move + stickMag * Math.max(0, Math.cos(diff)), -1, 1);
    }
    const thrust = Math.max(0, move);
    const reverse = Math.max(0, -move);

    this.heading += turn * H.turnRate * dt;
    this.forward(tmpForward);
    tmpRight.set(-tmpForward.z, 0, tmpForward.x); // starboard side when facing along forward

    const accel = new THREE.Vector3();
    accel.addScaledVector(tmpForward, thrust * H.thrustAccel - reverse * H.reverseAccel);
    accel.addScaledVector(tmpRight, strafe * H.strafeAccel);
    this.vel.addScaledVector(accel, dt);
    // Drag
    this.vel.multiplyScalar(Math.max(0, 1 - H.drag * dt));
    // Clamp speed per axis relative to heading
    const fwdSpeed = this.vel.dot(tmpForward);
    const sideSpeed = this.vel.dot(tmpRight);
    const f = clamp(fwdSpeed, -H.maxReverse, H.maxSpeed);
    const s = clamp(sideSpeed, -H.maxStrafe, H.maxStrafe);
    this.vel.copy(tmpForward).multiplyScalar(f).addScaledVector(tmpRight, s);
    this.speed = this.vel.length();

    this.pos.addScaledVector(this.vel, dt);
    world.terrain.clampToMap(this.pos, 12);

    // Altitude follows terrain with a bob.
    this.bob += dt;
    const ground = Math.max(world.terrain.heightAt(this.pos.x, this.pos.z), 0);
    const targetY = ground + H.hoverHeight + Math.sin(this.bob * 1.7) * 0.35;
    this.pos.y = damp(this.pos.y, targetY, 5, dt);

    // Visual attitude
    // Positive X rotation drops the nose (+Z), positive Z rotation dips the left side.
    this.kickPitch = damp(this.kickPitch, 0, 3.5, dt);
    this.kickBank = damp(this.kickBank, 0, 3.5, dt);
    const targetPitch = clamp(fwdSpeed * 0.011 + (thrust - reverse) * 0.06 + this.kickPitch, -0.5, 0.55);
    const targetBank = clamp(-sideSpeed * 0.02 + turn * 0.16 + this.kickBank, -0.7, 0.7);
    this.pitch = damp(this.pitch, targetPitch, 4, dt);
    this.bank = damp(this.bank, targetBank, 4, dt);
    this.object.rotation.set(0, this.heading, 0);
    this.body.rotation.set(this.pitch, 0, this.bank);
    this.syncObject();

    // Rotors
    // Slow enough that the blades read as turning rather than strobing;
    // the streaked disc underneath carries the sense of speed.
    const rotorSpeed = 13 + this.speed * 0.06;
    for (const s of this.spinners) s.obj.rotation[s.axis] += rotorSpeed * s.mul * dt;

    // Fuel
    this.fuel -= (H.fuelIdleDrain + Math.max(thrust, reverse) * H.fuelThrustDrain) * dt;
    if (this.fuel <= 0) {
      this.fuel = 0;
      world.playerCrashed("fuel");
      return;
    }

    // Rotor downwash. Emitted every step rather than on a timer so the ring is
    // continuous, and it thins out as the aircraft climbs away from the sand.
    if (ground > 0.5) {
      const altitude = this.pos.y - ground;
      // Full strength at the normal hover height, fading out as it climbs away.
      const closeness = clamp(1 - (altitude - H.hoverHeight) / (H.hoverHeight * 0.8), 0, 1);
      if (closeness > 0.02) {
        const strength = (0.7 + (this.speed / H.maxSpeed) * 0.45) * closeness;
        const leaves = world.data.theme.wash === "leaves";
        // Fractional counts still average out, so slow hovers stay lively.
        // Leaf litter is sparser than a sand ring: each fleck is opaque.
        this.washCarry += (leaves ? 1.5 : 11) * closeness * dt * 60;
        const n = Math.floor(this.washCarry);
        this.washCarry -= n;
        if (n > 0) {
          if (leaves) world.particles.leafWash(this.pos.x, ground, this.pos.z, strength, this.vel.x, this.vel.z, n);
          else world.particles.rotorWash(this.pos.x, ground, this.pos.z, strength, this.vel.x, this.vel.z, n);
        }
        world.props.sway(this.pos.x, this.pos.z, closeness, world.time, dt);
      } else world.props.sway(this.pos.x, this.pos.z, 0, world.time, dt);
    } else world.props.sway(this.pos.x, this.pos.z, 0, world.time, dt);

    // Weapons
    if (input.wasPressed("Digit1")) this.weapon = "gun";
    if (input.wasPressed("Digit2")) this.weapon = "hydra";
    if (input.wasPressed("Digit3")) this.weapon = "hellfire";
    if (input.wasPressed("Tab")) {
      const i = WEAPON_ORDER.indexOf(this.weapon);
      this.weapon = WEAPON_ORDER[(i + 1) % WEAPON_ORDER.length];
    }
    this.cooldown -= dt;
    if (input.isDown("Space", "ShiftLeft", "ShiftRight") && this.cooldown <= 0) this.fire();
    this.flareCooldown -= dt;
    if (input.wasPressed("KeyF", "ControlLeft", "ControlRight") && this.flareCooldown <= 0) this.deployFlares();

    this.updateWinch(dt);
    world.grid.update(this);
  }

  private fire(): void {
    const world = this.world;
    const spec = W[this.weapon];
    if (this.ammo[this.weapon] <= 0) {
      this.cooldown = 0.25;
      world.audio.play("empty");
      return;
    }
    this.ammo[this.weapon]--;
    this.cooldown = 1 / spec.rate;
    world.stats.shotsFired++;
    this.forward(tmpForward);
    tmpRight.set(-tmpForward.z, 0, tmpForward.x); // starboard side when facing along forward

    if (this.weapon === "gun") {
      this.gunSide = -this.gunSide;
      tmpMuzzle.copy(this.pos).addScaledVector(tmpForward, 5.5).add(new THREE.Vector3(0, -1.4, 0));
      tmpDir.copy(tmpForward);
      tmpDir.y = -0.12; // gentle drop; anything under the round's path is hit
      tmpDir.x += (Math.random() - 0.5) * spec.spread;
      tmpDir.z += (Math.random() - 0.5) * spec.spread;
      tmpDir.normalize();
      world.fire("gun", tmpMuzzle, tmpDir, "player", this);
      world.particles.muzzleFlash(tmpMuzzle, tmpForward);
      world.audio.play("gun");
    } else if (this.weapon === "hydra") {
      this.hydraSide = -this.hydraSide;
      tmpMuzzle.copy(this.pos).addScaledVector(tmpRight, this.hydraSide * 3).addScaledVector(tmpForward, 2).add(new THREE.Vector3(0, -1, 0));
      tmpDir.copy(tmpForward);
      tmpDir.y = -0.12;
      tmpDir.x += (Math.random() - 0.5) * spec.spread;
      tmpDir.z += (Math.random() - 0.5) * spec.spread;
      tmpDir.normalize();
      world.fire("hydra", tmpMuzzle, tmpDir, "player", this);
      world.audio.play("hydra");
    } else {
      this.hydraSide = -this.hydraSide;
      tmpMuzzle.copy(this.pos).addScaledVector(tmpRight, this.hydraSide * 3.2).add(new THREE.Vector3(0, -1.2, 0));
      tmpDir.copy(tmpForward);
      tmpDir.y = -0.05;
      tmpDir.normalize();
      const target = this.acquireTarget();
      world.fire("hellfire", tmpMuzzle, tmpDir, "player", this, target);
      world.audio.play("hellfire");
    }
  }

  /** Drop a spread of flares behind and below the aircraft and lure any locked missiles onto them. */
  private deployFlares(): void {
    const world = this.world;
    if (this.flares <= 0) {
      this.flareCooldown = 0.3;
      world.audio.play("empty");
      return;
    }
    this.flares--;
    this.flareCooldown = H.flareCooldown;
    this.forward(tmpForward);
    tmpRight.set(-tmpForward.z, 0, tmpForward.x);
    const flares: Flare[] = [];
    for (let i = 0; i < 3; i++) {
      const side = i - 1;
      const vel = this.vel.clone().multiplyScalar(0.35);
      vel.addScaledVector(tmpForward, -14 - Math.random() * 6);
      vel.addScaledVector(tmpRight, side * (9 + Math.random() * 4));
      vel.y = -4 - Math.random() * 3;
      const pos = this.pos.clone().addScaledVector(tmpForward, -3).add(new THREE.Vector3(0, -1.5, 0));
      const f = new Flare(pos, vel);
      world.add(f);
      flares.push(f);
    }
    world.decoyMissiles(flares);
    world.audio.play("flare");
  }

  /** Nearest enemy inside a forward cone for Hellfire guidance. */
  private acquireTarget(): Entity | null {
    const world = this.world;
    const range = W.hellfire.lockRange;
    this.forward(tmpForward);
    world.grid.query(this.pos.x, this.pos.z, range, nearby, (e) => e.team === "enemy" && e.targetable && e.kind !== "projectile");
    let best: Entity | null = null;
    let bestScore = Infinity;
    for (const e of nearby) {
      tmpDir.set(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z);
      const d = tmpDir.length();
      if (d < 1) continue;
      tmpDir.divideScalar(d);
      const cos = tmpDir.dot(tmpForward);
      if (cos < 0.55) continue; // roughly a 110 degree cone
      const score = d * (1.6 - cos);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private updateWinch(dt: number): void {
    const world = this.world;
    const lz = world.mission.data.lz;
    const slow = this.speed < H.winchMaxSpeed;
    const ground = world.terrain.heightAt(this.pos.x, this.pos.z);

    // Landing zone: unload passengers, refuel, repair.
    const dLZ = Math.hypot(this.pos.x - lz.x, this.pos.z - lz.z);
    this.atLZ = dLZ < lz.r && slow;
    if (this.atLZ) {
      this.winchTarget = null;
      this.winchProgress = 0;
      if (this.passengers > 0) {
        this.unloadTimer += dt;
        if (this.unloadTimer >= H.unloadTime) {
          this.unloadTimer = 0;
          this.passengers--;
          world.powRescued();
        }
      } else {
        this.unloadTimer = 0;
      }
      if (this.fuel < H.fuelMax) this.fuel = Math.min(H.fuelMax, this.fuel + H.lzRefuelRate * dt);
      if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + H.lzRepairRate * dt);
      this.rope.visible = false;
      return;
    }
    this.unloadTimer = 0;

    if (!slow || ground < 0) {
      this.winchTarget = null;
      this.winchProgress = Math.max(0, this.winchProgress - dt * 2);
      this.rope.visible = false;
      return;
    }

    // Find the nearest crate or POW under the aircraft.
    world.grid.query(this.pos.x, this.pos.z, H.winchRange, nearby, (e) => e.team === "neutral" && (e.kind === "pickup" || e.kind === "pow"));
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const e of nearby) {
      const d = this.distanceXZ(e);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) {
      this.winchTarget = null;
      this.winchProgress = Math.max(0, this.winchProgress - dt * 2);
      this.rope.visible = false;
      return;
    }
    if (best !== this.winchTarget) {
      this.winchTarget = best as Pickup | Pow;
      this.winchProgress = 0;
      world.audio.play("winch");
    }
    if (best.kind === "pow" && this.passengers >= H.passengersMax) {
      this.winchProgress = 0;
      world.setWinchLabel("CABIN FULL");
      this.rope.visible = false;
      return;
    }
    this.winchProgress += dt / H.winchTime;
    // Rope visual
    this.rope.visible = true;
    const pts = this.ropeGeo.attributes.position as THREE.BufferAttribute;
    pts.setXYZ(0, this.pos.x, this.pos.y - 1.5, this.pos.z);
    const t = Math.min(1, this.winchProgress);
    pts.setXYZ(1, best.pos.x, this.pos.y - 1.5 + (best.pos.y + 1 - (this.pos.y - 1.5)) * Math.min(1, t * 1.6), best.pos.z);
    pts.needsUpdate = true;
    if (this.winchProgress >= 1) {
      this.winchProgress = 0;
      this.rope.visible = false;
      (best as Pickup | Pow).collect(this);
      this.winchTarget = null;
    }
  }

  /**
   * Kinetic shove from a hit: the airframe is thrown along the round's travel
   * or away from a blast, and rolls and pitches with it. Scaled by damage, so
   * a cannon round barely nudges while a missile heaves the aircraft sideways.
   */
  push(dirX: number, dirZ: number, damage: number): void {
    if (!this.alive) return;
    const len = Math.hypot(dirX, dirZ);
    if (len < 1e-4) return;
    const nx = dirX / len;
    const nz = dirZ / len;
    // Grows faster than the damage itself, so heavy hits heave rather than nudge.
    const impulse = clamp(damage * 0.08 + damage * damage * 0.0012, 0, 12);
    this.vel.x += nx * impulse;
    this.vel.z += nz * impulse;
    // Roll away from the side the shove came from, nose down or up with fore/aft shoves.
    this.forward(tmpForward);
    const fwd = nx * tmpForward.x + nz * tmpForward.z;
    const side = nx * tmpForward.z - nz * tmpForward.x;
    const jolt = clamp(damage * 0.004 + damage * damage * 0.00006, 0, 0.5);
    this.kickPitch += fwd * jolt;
    this.kickBank += -side * jolt;
    this.world.shake(clamp(damage / 45, 0.1, 2.2));
  }

  protected onHit(amount: number): void {
    this.flash();
    this.world.stats.damageTaken += amount;
    this.world.events.emit("playerHit", { amount });
  }

  protected onDeath(): void {
    this.rope.visible = false;
    this.world.playerCrashed("destroyed");
  }

  /** Death is handled by World; keep the entity in the world. */
  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    this.onDeath();
  }

  dispose(): void {
    super.dispose();
    this.rope.removeFromParent();
    this.ropeGeo.dispose();
  }
}
