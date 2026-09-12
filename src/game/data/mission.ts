import type { TerrainConfig } from "../world/Terrain";
import type { Theme } from "../world/Theme";

export type SpawnType =
  | "tank"
  | "lightTank"
  | "aa"
  | "sam"
  | "infantry"
  | "gunboat"
  | "tanker"
  | "minelayer"
  | "jeep"
  | "truck"
  | "radar"
  | "radome"
  | "silo"
  | "hq"
  | "prison"
  | "building"
  | "wall"
  | "tower"
  | "fuelDepot"
  | "generator"
  | "pickup"
  | "pow"
  | "carrier";

export type PickupItem = "fuel" | "ammo" | "armor";

export interface Spawn {
  type: SpawnType;
  x: number;
  z: number;
  heading?: number;
  /** Patrol route for vehicles and boats (world XZ). */
  waypoints?: [number, number][];
  item?: PickupItem;
  variant?: number;
  /** Optional tag used by objectives. */
  tag?: string;
  /** Wall segment length for type "wall". */
  length?: number;
  /** Fed from the grid: stops firing once a blackout objective completes. */
  powered?: boolean;
  /** Prisoners released when a prison falls. */
  count?: number;
}

export interface FlatSpot {
  x: number;
  z: number;
  r: number;
  h?: number;
}

export type ObjectiveKind = "destroyTag" | "rescue" | "returnToLZ" | "escort";

export interface ObjectiveDef {
  id: string;
  kind: ObjectiveKind;
  text: string;
  /** Number of things to do; 1 for single targets. */
  total: number;
  /** Entity tag counted by destroyTag objectives. */
  tag?: string;
  /** Requires all previous objectives complete before it counts. */
  final?: boolean;
  /** World-level consequence of completing it. */
  effect?: "radarDown" | "blackout";
  /**
   * Timed objective: the first progress starts a countdown, and the mission is
   * lost if it lapses before completion. `cancelledBy` names an objective that,
   * once done, stops the countdown from ever starting.
   */
  deadline?: { seconds: number; label: string; failMessage: string; cancelledBy?: string };
  /** Escort objectives: said when the last escorted ship is lost and the mission fails. */
  failMessage?: string;
  doneMessage: string;
}

/** Non-interactive set dressing placed by the mission. */
export interface DecorItem {
  kind: "runway" | "dam" | "ruin" | "floes" | "crash" | "rig" | "buoys" | "quay" | "village" | "pen" | "lighthouse" | "hulk";
  x: number;
  z: number;
  heading: number;
  length?: number;
  width?: number;
  /** Scatter size for floes. */
  count?: number;
  /** Polyline for lane markers. */
  points?: [number, number][];
}

export interface MissionData {
  id: string;
  name: string;
  codename: string;
  /** One line for the mission picker. */
  summary: string;
  briefing: string[];
  seed: number;
  /** Music track name under public/music, without extension. */
  music: string;
  theme: Theme;
  terrain: TerrainConfig;
  base: { x: number; z: number };
  lz: { x: number; z: number; r: number };
  flats: FlatSpot[];
  spawns: Spawn[];
  decor?: DecorItem[];
  objectives: ObjectiveDef[];
}

/* Helpers to lay out compounds. */
export function ring(type: SpawnType, cx: number, cz: number, r: number, n: number, extra: Partial<Spawn> = {}): Spawn[] {
  const out: Spawn[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ type, x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r, heading: a + Math.PI, ...extra });
  }
  return out;
}

export function square(cx: number, cz: number, half: number, gapSide: number): Spawn[] {
  // Four walls made of segments, one side left open as a gate.
  const out: Spawn[] = [];
  const seg = half * 2;
  const sides = [
    { x: cx, z: cz - half, heading: 0, id: 0 },
    { x: cx + half, z: cz, heading: Math.PI / 2, id: 1 },
    { x: cx, z: cz + half, heading: 0, id: 2 },
    { x: cx - half, z: cz, heading: Math.PI / 2, id: 3 },
  ];
  for (const s of sides) {
    if (s.id === gapSide) {
      // two shorter pieces leaving a gap in the middle
      const along = s.heading === 0 ? [1, 0] : [0, 1];
      const q = seg * 0.3;
      out.push({ type: "wall", x: s.x + along[0] * (half - q / 2), z: s.z + along[1] * (half - q / 2), heading: s.heading, length: q * 1.35 });
      out.push({ type: "wall", x: s.x - along[0] * (half - q / 2), z: s.z - along[1] * (half - q / 2), heading: s.heading, length: q * 1.35 });
    } else {
      out.push({ type: "wall", x: s.x, z: s.z, heading: s.heading, length: seg });
    }
  }
  for (const [dx, dz] of [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ]) {
    out.push({ type: "tower", x: cx + dx, z: cz + dz });
  }
  return out;
}
