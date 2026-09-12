export type Screen =
  | "loading"
  | "title"
  | "missions"
  | "briefing"
  | "playing"
  | "paused"
  | "dead"
  | "won"
  | "lost"
  | "credits"
  | "controls";

export type WeaponId = "gun" | "hydra" | "hellfire";
export type Backend = "webgpu" | "webgl" | null;

export interface ObjectiveState {
  id: string;
  text: string;
  done: boolean;
  progress?: number;
  total?: number;
  locked?: boolean;
}

export type BlipKind = "enemy" | "sam" | "objective" | "pickup" | "pow" | "lz" | "missile" | "friendly";

export interface Blip {
  x: number;
  z: number;
  kind: BlipKind;
}

export interface RadioMessage {
  id: number;
  text: string;
  time: number;
}

export interface MissionStats {
  kills: number;
  rescued: number;
  shotsFired: number;
  damageTaken: number;
  livesLost: number;
  elapsed: number;
}

export interface MissionCard {
  id: string;
  name: string;
  codename: string;
  summary: string;
  swatch: number;
}

export interface Snapshot {
  screen: Screen;
  /** Current mission, and the list the picker offers. */
  missionId: string;
  missionName: string;
  missionCodename: string;
  briefing: string[];
  missions: MissionCard[];
  /** Highlighted entry on the picker, for keyboard users. */
  missionCursor: number;
  backend: Backend;
  loadProgress: number;
  loadLabel: string;
  armor: number;
  armorMax: number;
  fuel: number;
  fuelMax: number;
  ammo: Record<WeaponId, number>;
  ammoMax: Record<WeaponId, number>;
  weapon: WeaponId;
  flares: number;
  flaresMax: number;
  passengers: number;
  passengersMax: number;
  rescued: number;
  lives: number;
  objectives: ObjectiveState[];
  messages: RadioMessage[];
  winchProgress: number;
  winchLabel: string;
  incoming: boolean;
  /** Objective banner in the middle of the screen, or null. */
  banner: { title: string; text: string } | null;
  /** Timed objective countdown, or null. */
  countdown: { label: string; remaining: number } | null;
  /** Why the mission was lost, when not simply running out of aircraft. */
  lostReason: string;
  lowFuel: boolean;
  lowArmor: boolean;
  heli: { x: number; z: number; heading: number };
  blips: Blip[];
  mapSize: number;
  radarDown: boolean;
  /** The large tactical map, opened with M. */
  bigMap: boolean;
  stats: MissionStats;
  volume: number;
  musicVolume: number;
  /** Rounds bend a little toward the nearest target in front. */
  aimAssist: boolean;
  muted: boolean;
  audioReady: boolean;
  fps: number;
}

export const initialSnapshot: Snapshot = {
  screen: "loading",
  missionId: "",
  missionName: "",
  missionCodename: "",
  briefing: [],
  missions: [],
  missionCursor: 0,
  backend: null,
  loadProgress: 0,
  loadLabel: "initialising renderer",
  armor: 600,
  armorMax: 600,
  fuel: 100,
  fuelMax: 100,
  ammo: { gun: 1200, hydra: 38, hellfire: 8 },
  ammoMax: { gun: 1200, hydra: 38, hellfire: 8 },
  weapon: "gun",
  flares: 6,
  flaresMax: 6,
  passengers: 0,
  passengersMax: 6,
  rescued: 0,
  lives: 3,
  objectives: [],
  messages: [],
  winchProgress: 0,
  winchLabel: "",
  incoming: false,
  banner: null,
  countdown: null,
  lostReason: "",
  lowFuel: false,
  lowArmor: false,
  heli: { x: 0, z: 0, heading: 0 },
  blips: [],
  mapSize: 800,
  radarDown: false,
  bigMap: false,
  stats: { kills: 0, rescued: 0, shotsFired: 0, damageTaken: 0, livesLost: 0, elapsed: 0 },
  volume: 0.7,
  aimAssist: true,
  musicVolume: 0.55,
  muted: false,
  audioReady: false,
  fps: 0,
};

type Listener = () => void;

/**
 * Minimal external store. The game writes a fresh snapshot a few times per
 * second; React reads it through useSyncExternalStore in the HUD.
 */
export class Store {
  private snap: Snapshot = initialSnapshot;
  private listeners = new Set<Listener>();

  get = (): Snapshot => this.snap;

  set(partial: Partial<Snapshot>): void {
    this.snap = { ...this.snap, ...partial };
    for (const l of this.listeners) l();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

/** Player preferences the simulation reads live. Owned by Game, shared with World. */
export interface GameSettings {
  aimAssist: boolean;
}
