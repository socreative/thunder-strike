import * as THREE from "three/webgpu";
import { pass } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { Assets } from "./core/Assets";
import { Input } from "./core/Input";
import type { Blip, Screen, Store, WeaponId } from "./core/Store";
import { balance } from "./data/balance";
import type { MissionData } from "./data/mission";
import { MISSIONS, missionById } from "./data/missions";
import { Audio } from "./systems/Audio";
import { CameraRig } from "./systems/CameraRig";
import { World } from "./World";

const STEP = 1 / 60;
const zeroVel = new THREE.Vector3();
const shadowCentre = new THREE.Vector3();
const PUBLISH_HZ = 20;

/** Owns the renderer, the loop and screen flow. Gameplay lives in World. */
export class Game {
  private renderer!: THREE.WebGPURenderer;
  readonly input = new Input();
  private readonly audio = new Audio();
  private readonly assets = new Assets();
  private world: World | null = null;
  private mission: MissionData = MISSIONS[0];
  private missionCursor = 0;
  rig: CameraRig;
  private post: THREE.PostProcessing | null = null;
  private usePost = true;
  private screen: Screen = "loading";
  private acc = 0;
  private last = 0;
  private publishAcc = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fps = 0;
  private overview: ImageData | null = null;
  private disposed = false;
  private onResize = () => this.resize();
  /** Phone locked or app switched mid-flight: freeze rather than fly on unseen. */
  private onVisibility = () => {
    if (document.visibilityState !== "hidden") return;
    this.input.clearTouch();
    if (this.screen === "playing") this.togglePause();
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly store: Store,
  ) {
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
  }

  async init(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const forceWebGL = params.get("webgl") === "1";
    this.usePost = params.get("nopost") !== "1";

    this.renderer = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: true, forceWebGL });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    await this.renderer.init();
    if (this.disposed) return;
    const backend = (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "webgpu" : "webgl";
    this.store.set({ backend, loadLabel: "loading models", loadProgress: 0.1 });
    console.info(`[thunder-strike] renderer backend: ${backend}`);

    await this.assets.load((done, total, label) => {
      this.store.set({ loadProgress: 0.1 + 0.6 * (done / total), loadLabel: `loading ${label}` });
    });
    if (this.disposed) return;

    this.store.set({ loadLabel: "building the province", loadProgress: 0.75 });
    // Yield so the label paints before the heavy terrain build.
    await new Promise((r) => setTimeout(r, 30));
    this.createWorld();
    this.input.attach();
    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.setScreen("title");
    this.store.set({ loadProgress: 1, mapSize: balance.map.size });
    this.last = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __thunder: Game }).__thunder = this;
    }
  }

  /** Development helper: move the aircraft somewhere on the map. */
  debugTeleport(x: number, z: number, heading?: number): void {
    const world = this.world;
    if (!world) return;
    world.heli.pos.set(x, world.terrain.heightAt(x, z) + balance.heli.hoverHeight, z);
    if (heading !== undefined) world.heli.heading = heading;
    world.heli.vel.set(0, 0, 0);
    world.grid.update(world.heli);
    this.rig.snapTo(world.heli.pos);
  }

  /** Development helper: current world for inspection. */
  debugWorld(): World | null {
    return this.world;
  }

  private createWorld(): void {
    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
    const world = new World(this.mission, this.input, this.assets, this.audio);
    this.world = world;
    this.audio.setListener(world.heli.pos);
    this.rig.snapTo(world.heli.pos);
    world.enableCascadedShadows();
    // Rendered per world: each mission has its own map.
    this.overview = world.terrain.renderOverview(this.mission.theme.id === "jungle" ? 128 : 96);
    this.buildPost(world);
    this.publishMission();
  }

  private buildPost(world: World): void {
    this.post = null;
    if (!this.usePost) return;
    try {
      const post = new THREE.PostProcessing(this.renderer);
      const scenePass = pass(world.scene, this.rig.camera);
      const color = scenePass.getTextureNode("output");
      const glow = bloom(color, 0.32, 0.55, 0.9);
      post.outputNode = color.add(glow);
      this.post = post;
    } catch (err) {
      console.warn("[thunder-strike] post-processing disabled", err);
      this.post = null;
    }
  }

  /* Screen flow */

  private publishMission(): void {
    const m = this.mission;
    this.store.set({
      missionId: m.id,
      missionName: m.name,
      missionCodename: m.codename,
      briefing: m.briefing,
      missions: MISSIONS.map((d) => ({ id: d.id, name: d.name, codename: d.codename, summary: d.summary, swatch: d.theme.swatch })),
      missionCursor: this.missionCursor,
    });
  }

  /** From the picker: build the chosen map and go to its briefing. */
  selectMission(id: string): void {
    const data = missionById(id);
    if (!data) return;
    this.audio.ensure();
    this.missionCursor = MISSIONS.indexOf(data);
    // The world built at start-up is reused if it is untouched; anything else
    // is rebuilt behind the loading screen, since a jungle takes a few seconds.
    const fresh = this.world && this.mission === data && this.world.time === 0;
    if (fresh) {
      this.publishMission();
      this.publish(true);
      this.setScreen("briefing");
      this.audio.play("select");
      return;
    }
    this.mission = data;
    this.store.set({ loadLabel: `building ${data.theme.id === "jungle" ? "the valley" : "the province"}`, loadProgress: 0.85 });
    this.setScreen("loading");
    setTimeout(() => {
      if (this.disposed) return;
      this.createWorld();
      this.publish(true);
      this.store.set({ loadProgress: 1 });
      this.setScreen("briefing");
      this.audio.play("select");
    }, 40);
  }

  /** The mission after the current one, wrapping round. */
  nextMissionId(): string {
    return MISSIONS[(MISSIONS.indexOf(this.mission) + 1) % MISSIONS.length].id;
  }

  private moveMissionCursor(delta: number): void {
    this.missionCursor = (this.missionCursor + delta + MISSIONS.length) % MISSIONS.length;
    this.store.set({ missionCursor: this.missionCursor });
  }

  private setScreen(s: Screen): void {
    this.screen = s;
    this.store.set({ screen: s });
  }

  /** First user gesture: unlock audio so the menu music can start. */
  unlockAudio(): void {
    this.audio.ensure();
    if (this.audio.ready && !this.store.get().audioReady) this.store.set({ audioReady: true });
  }

  /**
   * Advance from the title or briefing. A keypress that also unlocks audio is
   * swallowed so the menu is heard first; a tap on the START button is its own
   * gesture, so the UI passes `fromUi` and proceeds in the same call.
   */
  start(fromUi = false): void {
    if (!this.store.get().audioReady) {
      this.unlockAudio();
      if (!fromUi) return;
    }
    this.audio.ensure();
    if (this.screen === "title") this.setScreen("missions");
    else if (this.screen === "missions") this.selectMission(MISSIONS[this.missionCursor].id);
    else if (this.screen === "briefing") {
      this.setScreen("playing");
      this.audio.play("select");
    }
  }

  togglePause(): void {
    if (this.screen === "playing") {
      this.setScreen("paused");
      this.audio.setRotor(false, 0);
    } else if (this.screen === "paused") {
      this.setScreen("playing");
    }
  }

  restart(): void {
    this.audio.ensure();
    this.createWorld();
    this.publish(true);
    this.setScreen("briefing");
  }

  showCredits(): void {
    this.setScreen("credits");
  }

  private controlsReturn: Screen = "paused";

  /** Controls overlay, reachable from the pause menu and the title screen. */
  showControls(): void {
    if (this.screen === "controls") return;
    this.controlsReturn = this.screen === "playing" ? "paused" : this.screen;
    this.setScreen("controls");
    this.audio.setRotor(false, 0);
  }

  hideControls(): void {
    if (this.screen !== "controls") return;
    this.setScreen(this.controlsReturn);
  }

  backToTitle(): void {
    if (this.world && (this.world.phase !== "playing" || this.screen === "paused")) this.createWorld();
    this.setScreen("title");
  }

  setVolume(v: number): void {
    this.audio.setVolume(v);
    this.store.set({ volume: v });
  }

  setMusicVolume(v: number): void {
    this.audio.setMusicVolume(v);
    this.store.set({ musicVolume: v });
  }

  /** Pick the music for the current screen. One track for now, ducked on menus. */
  private updateMusic(): void {
    switch (this.screen) {
      case "title":
      case "missions":
      case "credits":
        this.audio.playMusic(MISSIONS[0].music);
        break;
      case "briefing":
      case "controls":
      case "playing":
      case "dead":
      case "paused":
        this.audio.playMusic(this.mission.music);
        break;
      case "won":
      case "lost":
        this.audio.playMusic(null);
        break;
      default:
        break;
    }
    const world = this.world;
    let duck = 1;
    if (this.screen === "paused" || this.screen === "controls") duck = 0.35;
    else if (this.screen === "playing" && world && world.incomingMissile()) duck = 0.7;
    this.audio.setMusicDuck(duck);
    this.audio.updateMusic();
  }

  /** Weapon rows on the HUD are tappable in touch mode. */
  selectWeapon(id: WeaponId): void {
    const world = this.world;
    if (!world || this.screen !== "playing") return;
    world.heli.weapon = id;
    this.audio.play("select");
  }

  /** Camera distance change from a pinch, in the same units as wheel deltaY. */
  zoomBy(delta: number): void {
    this.rig.zoom(delta);
  }

  toggleMute(): void {
    this.audio.setMuted(!this.audio.muted);
    this.store.set({ muted: this.audio.muted });
  }

  /* Loop */

  private frame(now: number): void {
    if (this.disposed || !this.world) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    const world = this.world;
    const input = this.input;

    // Global keys. Remember whether audio was already unlocked before this
    // frame so the unlocking keypress is not also treated as a menu choice.
    const wasReady = this.store.get().audioReady;
    if (input.interacted) this.unlockAudio();
    if (input.take("KeyM")) this.toggleMute();
    this.updateMusic();
    switch (this.screen) {
      case "title":
        if (!wasReady) {
          // Any key is consumed by the audio unlock so the menu is heard, not skipped.
          if (input.anyPressed()) this.unlockAudio();
        } else if (input.wasPressed("Enter", "Space")) this.start();
        break;
      case "missions":
        if (input.wasPressed("ArrowDown", "ArrowRight", "KeyS", "KeyD", "Tab")) this.moveMissionCursor(1);
        if (input.wasPressed("ArrowUp", "ArrowLeft", "KeyW", "KeyA")) this.moveMissionCursor(-1);
        if (input.wasPressed("Digit1")) this.selectMission(MISSIONS[0].id);
        if (input.wasPressed("Digit2") && MISSIONS[1]) this.selectMission(MISSIONS[1].id);
        if (input.wasPressed("Enter", "Space")) this.start();
        if (input.wasPressed("Escape")) this.setScreen("title");
        break;
      case "briefing":
        if (input.wasPressed("Enter", "Space")) this.start();
        if (input.wasPressed("Escape")) this.setScreen("missions");
        break;
      case "playing":
        if (input.wasPressed("Escape", "KeyP")) this.togglePause();
        break;
      case "paused":
        if (input.wasPressed("Escape", "KeyP", "Enter")) this.togglePause();
        break;
      case "won":
      case "lost":
        if (input.wasPressed("Enter")) this.restart();
        break;
      case "credits":
        if (input.wasPressed("Escape", "Enter")) this.setScreen("title");
        break;
      case "controls":
        if (input.wasPressed("Escape", "Enter")) this.hideControls();
        break;
    }

    const simulating = this.screen === "playing" || this.screen === "dead";
    let steps = 0;
    if (simulating) {
      if (input.wheel !== 0) this.rig.zoom(input.wheel);
      this.acc += dt;
      while (this.acc >= STEP && steps < 5) {
        world.update(STEP);
        this.acc -= STEP;
        steps++;
        // Edge-triggered keys are consumed by the first simulation step.
        input.endFrame();
      }
      // After a hitch, drop the backlog rather than fast-forwarding through it
      // over the following frames; a held button would otherwise fire a burst.
      if (this.acc >= STEP) this.acc = 0;
      // Mirror world phase onto screens.
      if (world.phase === "dead" && this.screen !== "dead" && world.showLostBanner()) this.setScreen("dead");
      else if (world.phase === "playing" && this.screen === "dead") this.setScreen("playing");
      else if (world.phase === "won") {
        this.setScreen("won");
        this.audio.setRotor(false, 0);
      } else if (world.phase === "lost") {
        this.setScreen("lost");
        this.audio.setRotor(false, 0);
      }
      const heli = world.heli;
      const throttle = heli.speed / balance.heli.maxSpeed;
      this.audio.setRotor(heli.alive, throttle);
    } else {
      // Menus: keep the scene alive but frozen, rotors idle.
      world.particles.update(dt);
      this.audio.setRotor(false, 0);
    }
    // On displays above 60 Hz many frames run no sim step. Clearing edges on
    // those frames lost roughly every other tap, so only clear once a step
    // (or a menu) has had the chance to read them.
    if (!simulating || steps > 0) input.endFrame();

    const focus = world.cameraFocus();
    this.rig.update(dt, focus, focus === world.heli.pos ? world.heli.vel : zeroVel, world.shakeAmount, world.time);
    if (!world.usesCascades) {
      const groundY = Math.max(world.terrain.heightAt(focus.x, focus.z), 0);
      const radius = this.rig.groundFootprint(groundY, shadowCentre);
      world.setShadowVolume(shadowCentre, radius);
    }

    // FPS
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    this.publishAcc += dt;
    if (this.publishAcc >= 1 / PUBLISH_HZ) {
      this.publishAcc = 0;
      this.publish(false);
    }

    if (this.post) this.post.render();
    else this.renderer.render(world.scene, this.rig.camera);
  }

  private publish(force: boolean): void {
    const world = this.world;
    if (!world) return;
    const heli = world.heli;
    const mission = world.mission;
    const blips: Blip[] = [];
    const radarDown = mission.radarDown;
    const range2 = balance.radarRange * balance.radarRange;
    for (const e of world.entities) {
      if (!e.alive) continue;
      if (e.kind === "projectile") {
        if ((e as { projKind?: string }).projKind === "sam") blips.push({ x: e.pos.x, z: e.pos.z, kind: "missile" });
        continue;
      }
      if (e.kind === "pickup") {
        blips.push({ x: e.pos.x, z: e.pos.z, kind: "pickup" });
        continue;
      }
      if (e.kind === "pow") {
        blips.push({ x: e.pos.x, z: e.pos.z, kind: "pow" });
        continue;
      }
      if (e.tag) {
        blips.push({ x: e.pos.x, z: e.pos.z, kind: e.tag === "sam" ? "sam" : "objective" });
        continue;
      }
      if (!e.blip || e.team !== "enemy") continue;
      const dx = e.pos.x - heli.pos.x;
      const dz = e.pos.z - heli.pos.z;
      if (radarDown || dx * dx + dz * dz < range2) blips.push({ x: e.pos.x, z: e.pos.z, kind: "enemy" });
    }
    blips.push({ x: world.data.lz.x, z: world.data.lz.z, kind: "lz" });

    const recent = world.messages.filter((m) => world.time - m.time < 7);
    this.store.set({
      backend: this.store.get().backend,
      armor: Math.round(heli.hp),
      armorMax: heli.maxHp,
      fuel: heli.fuel,
      fuelMax: balance.heli.fuelMax,
      ammo: { ...heli.ammo },
      weapon: heli.weapon,
      flares: heli.flares,
      flaresMax: balance.heli.flares,
      passengers: heli.passengers,
      passengersMax: balance.heli.passengersMax,
      rescued: world.stats.rescued,
      lives: world.lives,
      objectives: mission.objectives.map((o) => ({ ...o })),
      messages: recent.map((m) => ({ ...m })),
      winchProgress: heli.winchProgress,
      winchLabel: world.winchLabel,
      incoming: world.incomingMissile(),
      lowFuel: heli.fuel < 22,
      lowArmor: heli.hp < heli.maxHp * 0.25,
      heli: { x: heli.pos.x, z: heli.pos.z, heading: heli.heading },
      blips,
      radarDown,
      stats: { ...world.stats },
      fps: this.fps,
      ...(force ? { screen: this.screen } : {}),
    });
  }

  getOverview(): ImageData | null {
    return this.overview;
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.rig.resize(w / h);
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.input.detach();
    this.audio.dispose();
    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
      this.renderer.dispose();
    }
    this.world?.dispose();
    this.world = null;
  }
}
