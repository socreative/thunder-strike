import * as THREE from "three/webgpu";
import type { Assets } from "./core/Assets";
import type { Input } from "./core/Input";
import { Emitter } from "./core/Events";
import { Random } from "./core/Random";
import { SpatialGrid } from "./core/SpatialGrid";
import type { GameSettings, MissionStats } from "./core/Store";
import { balance } from "./data/balance";
import type { MissionData, Spawn } from "./data/mission";
import { Entity, type Team } from "./entities/Entity";
import { Helicopter } from "./entities/Helicopter";
import { Pickup } from "./entities/Pickup";
import type { Flare } from "./entities/Flare";
import { Projectile, type ProjectileKind } from "./entities/Projectile";
import { Structure, type StructureType } from "./entities/Structure";
import { Wreck, type WreckStyle } from "./entities/Wreck";
import { AAGun } from "./entities/enemies/AAGun";
import { Infantry } from "./entities/enemies/Infantry";
import { SamSite } from "./entities/enemies/SamSite";
import { Tank } from "./entities/enemies/Tank";
import { Gunboat } from "./entities/enemies/Gunboat";
import { Vehicle } from "./entities/enemies/Vehicle";
import { Ship } from "./entities/enemies/Ship";
import { Pow } from "./entities/Pow";
import type { SpawnType } from "./data/mission";
import { HealthBars } from "./fx/HealthBars";
import { Particles } from "./fx/Particles";
import { HeliWreckage } from "./fx/Wreckage";
import type { Audio } from "./systems/Audio";
import { Mission } from "./systems/Mission";
import { createDecor } from "./world/Decor";
import { Props, type Exclusion } from "./world/Props";
import { CSMShadowNode } from "three/addons/csm/CSMShadowNode.js";
import { createSky, createSun } from "./world/Sky";
import { Terrain } from "./world/Terrain";
import { createWater } from "./world/Water";

export type Phase = "playing" | "dead" | "won" | "lost";

interface Timer {
  at: number;
  fn: () => void;
}

const hits: Entity[] = [];

/** One mission's worth of gameplay state. Recreated on restart. */
export class World {
  readonly scene: THREE.Scene;
  readonly terrain: Terrain;
  readonly grid: SpatialGrid;
  readonly rng: Random;
  readonly events = new Emitter();
  readonly particles: Particles;
  readonly healthBars = new HealthBars();
  readonly heli: Helicopter;
  readonly mission: Mission;
  readonly entities: Entity[] = [];
  readonly stats: MissionStats = { kills: 0, rescued: 0, shotsFired: 0, damageTaken: 0, livesLost: 0, elapsed: 0 };
  readonly sun: THREE.DirectionalLight;
  readonly flashLight: THREE.PointLight;
  time = 0;
  phase: Phase = "playing";
  lives = balance.heli.lives;
  shakeAmount = 0;
  winchLabel = "";
  /** Centre-screen notice, shown until `until` in world time. */
  banner: { title: string; text: string; until: number } | null = null;
  /** Timed objective in progress. */
  countdown: { label: string; remaining: number; failMessage: string } | null = null;
  private countdownTick = 0;
  /** Set when the mission is lost for a reason other than running out of aircraft. */
  lostReason = "";
  messages: { id: number; text: string; time: number }[] = [];
  private messageId = 0;
  private pendingAdd: Entity[] = [];
  private pendingRemove = new Set<Entity>();
  private timers: Timer[] = [];
  private deathTimer = 0;
  private deathTotal = 0;
  private wreckage: HeliWreckage | null = null;
  readonly props: Props;
  private water: THREE.Mesh;
  private sky: THREE.Mesh;
  private decor: THREE.Group;
  private decorSpinners: THREE.Object3D[] = [];
  /** Points that burn steadily, such as a rig's flare stack. */
  readonly decorFlames: THREE.Vector3[] = [];
  private flameTimer = 0;
  private hemi: THREE.HemisphereLight;
  private flashDecay = 0;
  private incoming = false;
  private shadowRadius = 0;
  private csm: CSMShadowNode | null = null;
  /** True once cascades are running, so the single-volume path can be skipped. */
  usesCascades = false;
  private alertTimer = 0;

  constructor(
    readonly data: MissionData,
    readonly input: Input,
    readonly assets: Assets,
    readonly audio: Audio,
    readonly settings: GameSettings = { aimAssist: true },
  ) {
    const theme = data.theme;
    this.scene = new THREE.Scene();
    this.rng = new Random(data.seed);
    this.terrain = new Terrain(data.seed, data.flats, data.terrain, theme.ground, theme.overview);
    this.grid = new SpatialGrid(this.terrain.size + 200, balance.map.cellSize);
    this.scene.add(this.terrain.mesh);
    this.water = createWater(this.terrain.size, theme.water);
    this.scene.add(this.water);
    this.sky = createSky(1800, theme.sky);
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);
    const { sun, hemi } = createSun(theme.sky);
    this.sun = sun;
    this.hemi = hemi;
    this.scene.add(sun, sun.target, hemi);
    this.flashLight = new THREE.PointLight(0xffa050, 0, 80, 1.5);
    this.scene.add(this.flashLight);

    this.props = new Props(this.terrain, this.propExclusions(), data.seed, theme.props);
    this.scene.add(this.props.group);
    this.decor = createDecor(data, this.terrain, this.decorSpinners, assets, this.decorFlames);
    this.scene.add(this.decor);

    this.particles = new Particles();
    this.particles.setDustColors(theme.dust.start, theme.dust.end);
    this.particles.groundAt = (x, z) => Math.max(this.terrain.heightAt(x, z), 0);
    this.scene.add(this.particles.group);
    this.scene.add(this.healthBars.sprite);

    this.heli = new Helicopter();
    this.heli.pos.set(data.base.x, 0, data.base.z);
    this.add(this.heli);
    this.flush();
    this.heli.respawn(data.base.x, data.base.z, Math.PI / 4);

    for (const s of data.spawns) this.spawnFromDef(s);
    this.flush();

    this.mission = new Mission(this, data);
    this.message(`${data.name}. Objectives are on your left. Good hunting.`);
  }

  /* Entity management */

  add(e: Entity): void {
    e.world = this;
    this.pendingAdd.push(e);
  }

  remove(e: Entity): void {
    this.pendingRemove.add(e);
  }

  private flush(): void {
    for (const e of this.pendingAdd) {
      this.entities.push(e);
      this.scene.add(e.object);
      e.syncObject();
      this.grid.insert(e);
      e.onSpawn();
      e.syncObject();
    }
    this.pendingAdd.length = 0;
    if (this.pendingRemove.size) {
      for (const e of this.pendingRemove) {
        const i = this.entities.indexOf(e);
        if (i >= 0) this.entities.splice(i, 1);
        this.grid.remove(e);
        e.dispose();
      }
      this.pendingRemove.clear();
    }
  }

  /**
   * Ground kept free of vegetation. The desert clears only its flats, which is
   * how it always was; the jungle also clears every installation and patrol
   * lane so nothing drives through a tree trunk.
   */
  private propExclusions(): Exclusion[] {
    const data = this.data;
    const ex: Exclusion[] = data.flats.map((f) => ({ x: f.x, z: f.z, r: f.r + 6 }));
    if (!data.theme.props.clearSpawns) return ex;
    const CLEAR: Partial<Record<SpawnType, number>> = {
      tank: 12,
      lightTank: 11,
      aa: 8,
      sam: 10,
      infantry: 4,
      pickup: 6,
      pow: 5,
      building: 10,
      hq: 18,
      prison: 14,
      radar: 12,
      generator: 12,
      radome: 12,
      silo: 16,
      jeep: 8,
      truck: 9,
      tower: 4,
      fuelDepot: 7,
    };
    for (const s of data.spawns) {
      const r = s.type === "wall" ? (s.length ?? 20) / 2 + 4 : (CLEAR[s.type] ?? 0);
      if (r > 0) ex.push({ x: s.x, z: s.z, r });
      if (s.waypoints && s.type !== "gunboat" && s.type !== "tanker" && s.type !== "minelayer") {
        const pts = s.waypoints;
        for (let i = 0; i < pts.length; i++) {
          const [ax, az] = pts[i];
          const [bx, bz] = pts[(i + 1) % pts.length];
          const len = Math.hypot(bx - ax, bz - az);
          const steps = Math.max(1, Math.ceil(len / 10));
          for (let k = 0; k <= steps; k++) ex.push({ x: ax + ((bx - ax) * k) / steps, z: az + ((bz - az) * k) / steps, r: 8 });
        }
      }
    }
    for (const d of data.decor ?? []) {
      if (d.kind === "floes") continue;
      ex.push({ x: d.x, z: d.z, r: d.kind === "runway" ? (d.length ?? 120) / 2 + 12 : d.kind === "dam" ? (d.length ?? 60) / 2 + 10 : d.kind === "crash" ? 34 : 26 });
    }
    return ex;
  }

  /** The generator objective: everything wired to the grid goes quiet. */
  gridDown = false;

  blackout(): void {
    this.gridDown = true;
    this.message("Grid is dark. Their river defences have lost power.");
  }

  private spawnFromDef(s: Spawn): void {
    const y = this.terrain.heightAt(s.x, s.z);
    let e: Entity | null = null;
    switch (s.type) {
      case "tank":
        e = new Tank(false, s.heading ?? this.rng.range(0, Math.PI * 2), s.waypoints);
        break;
      case "lightTank":
        e = new Tank(true, s.heading ?? this.rng.range(0, Math.PI * 2), s.waypoints);
        break;
      case "aa":
        e = new AAGun(!!s.powered);
        break;
      case "sam":
        e = new SamSite(!!s.powered);
        break;
      case "infantry":
        e = new Infantry();
        break;
      case "jeep":
        e = new Vehicle("jeep", s.heading ?? this.rng.range(0, Math.PI * 2), s.waypoints);
        break;
      case "truck":
        e = new Vehicle("truck", s.heading ?? this.rng.range(0, Math.PI * 2), s.waypoints);
        break;
      case "tanker":
        e = new Ship("tanker", s.heading ?? 0, s.waypoints);
        break;
      case "minelayer":
        e = new Ship("minelayer", s.heading ?? 0, s.waypoints);
        break;
      case "gunboat":
        e = new Gunboat(s.heading ?? 0, s.waypoints);
        if (process.env.NODE_ENV !== "production") {
          for (const [wx, wz] of s.waypoints ?? []) {
            if (this.terrain.riverDistance(wx, wz) > -4) console.warn(`[thunder-strike] gunboat waypoint ${wx},${wz} is too close to the bank`);
          }
        }
        break;
      case "pickup":
        e = new Pickup(s.item ?? "fuel");
        break;
      case "pow":
        e = new Pow();
        break;
      case "carrier":
        return; // handled by decor
      default:
        e = new Structure(s.type as StructureType, s.heading ?? 0, s.variant ?? 0, s.length ?? 20, s.count ?? 4);
    }
    if (process.env.NODE_ENV !== "production" && s.waypoints && s.type !== "gunboat" && s.type !== "tanker" && s.type !== "minelayer") {
      for (const [wx, wz] of s.waypoints) {
        if (this.terrain.riverDistance(wx, wz) < 0) console.warn(`[thunder-strike] ${s.type} waypoint ${wx},${wz} is in the river`);
      }
    }
    e.pos.set(s.x, y, s.z);
    e.tag = s.tag;
    this.add(e);
  }

  /* Combat helpers */

  fire(kind: ProjectileKind, pos: THREE.Vector3, dir: THREE.Vector3, team: Team, owner: Entity | null, target: Entity | null = null): Projectile {
    const p = new Projectile(kind, pos, dir, team, owner, target);
    this.add(p);
    this.events.emit("shot", { kind, pos });
    return p;
  }

  /**
   * Blast at a point. `team` is the side that caused it: it never hurts its
   * own side, and "neutral" blasts (fuel tanks, wrecks) hurt everyone.
   */
  explode(pos: THREE.Vector3, radius: number, damage: number, team: Team, size = 1.5, source: Entity | null = null): void {
    // Blasts well clear of the ground burst differently: no dust ring, no rising column.
    const airborne = pos.y - Math.max(this.terrain.heightAt(pos.x, pos.z), 0) > 5;
    this.particles.explosion(pos, size, airborne);
    this.events.emit("explosion", { pos, size });
    this.audio.play(size >= 2.4 ? "explosion" : "explosionSmall", pos);
    // Light flash
    this.flashLight.position.copy(pos);
    this.flashLight.position.y += 2;
    this.flashLight.intensity = Math.max(this.flashLight.intensity, 400 * size);
    this.flashDecay = 6;
    // Shake scales with size and proximity to the player.
    const d = pos.distanceTo(this.heli.pos);
    this.shake(size * 0.8 * Math.max(0, 1 - d / 120));

    if (damage <= 0) return;
    this.grid.query(pos.x, pos.z, radius, hits, (e) => e.targetable && e !== source && (team === "neutral" ? e.team !== "neutral" : e.team !== team && e.team !== "neutral"));
    for (const h of hits) {
      const dist = h.distanceXZ(pos);
      const falloff = 1 - 0.5 * Math.min(1, dist / (radius + h.radius));
      h.damage(damage * falloff, source ?? undefined);
      // Blasts throw the aircraft away from their centre.
      if (h === this.heli) this.heli.push(h.pos.x - pos.x, h.pos.z - pos.z, damage * falloff);
    }
  }

  spawnWreck(pos: THREE.Vector3, heading: number, size: number, style: WreckStyle): void {
    const w = new Wreck(heading, size, style);
    w.pos.copy(pos);
    w.pos.y = this.terrain.heightAt(pos.x, pos.z);
    this.add(w);
  }

  reportKill(entity: Entity, source?: Entity): void {
    const byPlayer = source?.team === "player";
    if (byPlayer && entity.kind !== "wall" && entity.kind !== "tower") this.stats.kills++;
    this.events.emit("kill", { entity, byPlayer });
  }

  /* Player flow */

  powRescued(): void {
    this.stats.rescued++;
    this.events.emit("powRescued", { count: this.stats.rescued });
    this.audio.play("rescue");
    this.message(`POW delivered to the LZ (${this.stats.rescued}).`);
  }

  playerCrashed(reason: "fuel" | "destroyed"): void {
    if (this.phase !== "playing") return;
    const heli = this.heli;
    heli.alive = false;
    // Build the wreckage from the live model before hiding it.
    heli.resetFlash();
    const wreck = new HeliWreckage(heli.object, heli.vel, reason === "fuel");
    this.add(wreck);
    this.wreckage = wreck;
    heli.object.visible = false;
    if (reason === "fuel") {
      this.message("Out of fuel. Engine flame-out, going down.");
      this.audio.play("empty");
    } else {
      this.explode(heli.pos, 6, 0, "player", 3.4, heli);
      this.later(0.25, () => this.explode(wreck.focus, 3, 0, "player", 2.0, heli));
      this.message("Aircraft destroyed.");
      this.audio.play("crash");
    }
    if (heli.passengers > 0) {
      this.message(`${heli.passengers} passenger${heli.passengers > 1 ? "s were" : " was"} lost with the aircraft.`);
    }
    this.shake(3);
    this.lives--;
    this.stats.livesLost++;
    this.events.emit("playerDied", {});
    this.phase = "dead";
    this.deathTimer = reason === "fuel" ? 6.0 : 5.2;
    this.deathTotal = this.deathTimer;
  }

  /** Where the camera should look: the aircraft, or the falling hull after a crash. */
  cameraFocus(): THREE.Vector3 {
    if (this.phase === "dead" && this.wreckage && this.wreckage.alive) return this.wreckage.focus;
    return this.heli.pos;
  }

  /** True once the crash has played out enough to show the lost banner. */
  showLostBanner(): boolean {
    return this.phase === "dead" && this.deathTotal - this.deathTimer > 1.6;
  }

  private respawn(): void {
    const b = this.data.base;
    this.heli.respawn(b.x, b.z, Math.PI / 4);
    this.grid.update(this.heli);
    // Clear any missiles still chasing the previous airframe.
    for (const e of this.entities) if (e.kind === "projectile") e.kill();
    this.phase = "playing";
    this.message(`Replacement aircraft ready. ${this.lives} ${this.lives === 1 ? "life" : "lives"} remaining.`);
  }

  message(text: string): void {
    this.messages.push({ id: ++this.messageId, text, time: this.time });
    if (this.messages.length > 6) this.messages.shift();
    this.events.emit("message", { text });
    this.audio.play("message");
  }

  startCountdown(seconds: number, label: string, failMessage: string): void {
    if (this.countdown) return;
    this.countdown = { label, remaining: seconds, failMessage };
    this.countdownTick = 0;
    this.message(`${label}: ${Math.round(seconds)} seconds.`);
    this.audio.play("missileAlert");
  }

  stopCountdown(): void {
    if (!this.countdown) return;
    this.countdown = null;
    this.message("Launch sequence aborted.");
  }

  /** Lose the mission outright, whatever the state of the aircraft. */
  failMission(reason: string): void {
    if (this.phase === "won" || this.phase === "lost") return;
    this.lostReason = reason;
    this.message(reason);
    this.phase = "lost";
    this.events.emit("missionLost", {});
  }

  showBanner(title: string, text: string, seconds = 4): void {
    this.banner = { title, text, until: this.time + seconds };
  }

  setWinchLabel(label: string): void {
    this.winchLabel = label;
  }

  later(delay: number, fn: () => void): void {
    this.timers.push({ at: this.time + delay, fn });
  }

  shake(amount: number): void {
    this.shakeAmount = Math.min(4, this.shakeAmount + amount);
  }

  /* Frame */

  update(dt: number): void {
    this.time += dt;
    if (this.phase === "playing") this.stats.elapsed += dt;
    this.winchLabel = "";

    for (const e of this.entities) {
      if (e.alive) e.update(dt);
    }
    this.flush();

    // Timers
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.time);
        for (const t of due) t.fn();
      }
    }

    // Missile warning: chirps on a steady cadence while something is locked on.
    this.incoming = this.scanIncoming();
    if (this.incoming && this.heli.alive) {
      this.alertTimer -= dt;
      if (this.alertTimer <= 0) {
        this.alertTimer = 0.55;
        this.audio.play("missileAlert");
      }
    } else {
      this.alertTimer = 0;
    }

    // Launch countdown: ticks every second, twice a second in the last fifteen.
    if (this.countdown && this.phase === "playing") {
      this.countdown.remaining -= dt;
      this.countdownTick -= dt;
      if (this.countdownTick <= 0) {
        this.countdownTick = this.countdown.remaining < 15 ? 0.5 : 1;
        this.audio.play("tick");
      }
      if (this.countdown.remaining <= 0) {
        const msg = this.countdown.failMessage;
        this.countdown = null;
        this.failMission(msg);
      }
    }

    for (const s of this.decorSpinners) s.rotation.y += 0.55 * dt;
    if (this.decorFlames.length) {
      this.flameTimer -= dt;
      if (this.flameTimer <= 0) {
        this.flameTimer = 0.06;
        for (const f of this.decorFlames) this.particles.flareStack(f);
      }
    }
    this.particles.update(dt);
    this.healthBars.update(this.entities, this.time);
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 4);
    if (this.flashLight.intensity > 0) {
      this.flashLight.intensity = Math.max(0, this.flashLight.intensity - this.flashLight.intensity * this.flashDecay * dt - 20 * dt);
    }

    // The sun is low and oblique so the aircraft's shadow falls well away from
    // it and altitude reads clearly. Where the shadow volume sits is decided by
    // the camera, in setShadowVolume, not here.

    // Winch label for the HUD
    if (this.heli.alive) {
      if (this.heli.atLZ) {
        if (this.heli.passengers > 0) this.winchLabel = "UNLOADING";
        else if (this.heli.fuel < balance.heli.fuelMax - 0.5 || this.heli.hp < this.heli.maxHp - 0.5) this.winchLabel = "REFUEL / REPAIR";
      } else if (this.heli.winchTarget) {
        this.winchLabel = this.heli.winchTarget.kind === "pow" ? "WINCHING POW" : "WINCHING CRATE";
      }
    }

    this.mission.update();
    if (this.mission.won && this.phase === "playing") {
      this.phase = "won";
      this.audio.play("victory");
      this.events.emit("missionWon", {});
    }

    if (this.phase === "dead") {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) {
        if (this.lives > 0) this.respawn();
        else {
          this.phase = "lost";
          this.events.emit("missionLost", {});
        }
      }
    }
  }

  /**
   * Split the view into cascaded shadow maps. One map stretched over the whole
   * visible ground gives every object the same coarse texel, which reads as
   * blocky up close; cascades give the near slice a full map of its own.
   * Returns false if cascades are unavailable, leaving the single-map path.
   */
  enableCascadedShadows(): boolean {
    try {
      const csm = new CSMShadowNode(this.sun, { cascades: 3, maxFar: 320, mode: "practical", lightMargin: 160 });
      // Leave `camera` null: the node only initialises its cascades and lights
      // when it first builds, and it skips that entirely if a camera is already
      // assigned. It picks up the render camera itself.
      csm.fade = true;
      (this.sun.shadow as unknown as { shadowNode: CSMShadowNode }).shadowNode = csm;
      this.csm = csm;
      this.usesCascades = true;
      // Cascades derive their volumes from the light direction alone, so the
      // sun stops chasing the camera and just holds its angle.
      this.sun.position.set(-150, 120, 95);
      this.sun.target.position.set(0, 0, 0);
      this.sun.target.updateMatrixWorld();
      return true;
    } catch (err) {
      console.warn("[thunder-strike] cascaded shadows unavailable", err);
      this.csm = null;
      this.usesCascades = false;
      return false;
    }
  }

  /**
   * Aim the sun's single shadow volume at the ground the camera can see, used
   * only when cascades are unavailable. Centring it on the aircraft left the
   * top of the screen unshadowed, so objects only grew shadows once they had
   * scrolled well inside the frame.
   */
  setShadowVolume(centre: THREE.Vector3, radius: number): void {
    if (this.csm) return;
    this.sun.position.set(centre.x - 150, centre.y + 120, centre.z + 95);
    this.sun.target.position.copy(centre);
    this.sun.target.updateMatrixWorld();
    const cam = this.sun.shadow.camera;
    // Resizing every frame makes shadows swim, so only when the view changes.
    if (Math.abs(radius - this.shadowRadius) > 4) {
      this.shadowRadius = radius;
      cam.left = -radius;
      cam.right = radius;
      cam.top = radius;
      cam.bottom = -radius;
      cam.far = radius * 2.6 + 260;
      cam.updateProjectionMatrix();
    }
  }

  /** Missiles locked on the aircraft within range may switch to a flare. */
  decoyMissiles(flares: Flare[]): void {
    if (flares.length === 0) return;
    const heli = this.heli;
    let lured = 0;
    for (const e of this.entities) {
      if (e.kind !== "projectile" || !e.alive) continue;
      const p = e as Projectile;
      if (p.projKind !== "sam" || p.target !== heli) continue;
      if (p.distanceXZ(heli) > balance.heli.flareDecoyRange) continue;
      if (Math.random() > balance.heli.flareDecoyChance) continue;
      p.target = flares[Math.floor(Math.random() * flares.length)];
      p.decoyed = true;
      lured++;
    }
    if (lured > 0) this.message(lured === 1 ? "Missile decoyed." : `${lured} missiles decoyed.`);
    else this.message("Flares away. Nothing locked on.");
  }

  /** Any enemy missile currently homing on the player. Recomputed once per frame. */
  incomingMissile(): boolean {
    return this.incoming;
  }

  private scanIncoming(): boolean {
    for (const e of this.entities) {
      if (e.kind === "projectile" && (e as Projectile).projKind === "sam" && e.alive && !(e as Projectile).decoyed) return true;
    }
    return false;
  }

  dispose(): void {
    this.csm?.dispose();
    this.csm = null;
    for (const e of this.entities) e.dispose();
    this.entities.length = 0;
    this.grid.clear();
    this.events.clear();
    this.terrain.dispose();
    this.props.dispose();
    this.particles.dispose();
    this.healthBars.dispose();
    (this.water.material as THREE.Material).dispose();
    this.water.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.sky.geometry.dispose();
    this.decor.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.sharedGeometry) m.geometry.dispose();
    });
    this.scene.clear();
  }
}
