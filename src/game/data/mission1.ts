export type SpawnType =
  | "tank"
  | "lightTank"
  | "aa"
  | "sam"
  | "infantry"
  | "radar"
  | "hq"
  | "prison"
  | "building"
  | "wall"
  | "tower"
  | "fuelDepot"
  | "pickup"
  | "carrier";

export type PickupItem = "fuel" | "ammo" | "armor";

export interface Spawn {
  type: SpawnType;
  x: number;
  z: number;
  heading?: number;
  /** Patrol route for vehicles (world XZ). */
  waypoints?: [number, number][];
  item?: PickupItem;
  variant?: number;
  /** Optional tag used by objectives. */
  tag?: string;
  /** Wall segment length for type "wall". */
  length?: number;
}

export interface FlatSpot {
  x: number;
  z: number;
  r: number;
  h?: number;
}

export interface ObjectiveDef {
  id: string;
  text: string;
  /** Number of things to do; 1 for single targets. */
  total: number;
  /** Requires all previous objectives complete before it counts. */
  final?: boolean;
  doneMessage: string;
}

export interface MissionData {
  name: string;
  codename: string;
  briefing: string[];
  seed: number;
  base: { x: number; z: number };
  lz: { x: number; z: number; r: number };
  flats: FlatSpot[];
  spawns: Spawn[];
  objectives: ObjectiveDef[];
}

/* Helpers to lay out compounds. */
function ring(type: SpawnType, cx: number, cz: number, r: number, n: number, extra: Partial<Spawn> = {}): Spawn[] {
  const out: Spawn[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ type, x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r, heading: a + Math.PI, ...extra });
  }
  return out;
}

function square(cx: number, cz: number, half: number, gapSide: number): Spawn[] {
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

const RADAR = { x: -160, z: -260 };
const SAM_A = { x: 40, z: -200 };
const SAM_B = { x: 210, z: 20 };
const SAM_C = { x: -60, z: 120 };
const PRISON = { x: 250, z: -230 };
const HQ = { x: 300, z: 250 };
const DEPOT = { x: -150, z: 10 };
const VILLAGE_A = { x: -40, z: -70 };
const VILLAGE_B = { x: 120, z: 160 };
const BASE = { x: -225, z: 240 };

export const mission1: MissionData = {
  name: "Operation Sandglass",
  codename: "SANDGLASS",
  seed: 1992,
  briefing: [
    "A hostile general has seized the coastal province and is holding our downed pilots in a desert prison camp.",
    "You will fly a single AH-64 from the forward landing zone on the beach. The airspace is covered by a coastal radar station and three surface to air missile batteries.",
    "Take down the radar first to blind their network, clear the SAM sites, level the prison and bring the four POWs back to the landing zone.",
    "Once the enemy headquarters bunker is destroyed, return to the landing zone for extraction.",
    "Fuel is the enemy as much as the armour is. Fuel drums, ammunition crates and armour crates are scattered across the province. Hover slowly over them to winch them up.",
  ],
  base: BASE,
  lz: { x: BASE.x, z: BASE.z, r: 14 },
  flats: [
    { x: BASE.x, z: BASE.z, r: 45, h: 3 },
    { x: RADAR.x, z: RADAR.z, r: 45 },
    { x: SAM_A.x, z: SAM_A.z, r: 32 },
    { x: SAM_B.x, z: SAM_B.z, r: 32 },
    { x: SAM_C.x, z: SAM_C.z, r: 32 },
    { x: PRISON.x, z: PRISON.z, r: 60 },
    { x: HQ.x, z: HQ.z, r: 75 },
    { x: DEPOT.x, z: DEPOT.z, r: 45 },
    { x: VILLAGE_A.x, z: VILLAGE_A.z, r: 45 },
    { x: VILLAGE_B.x, z: VILLAGE_B.z, r: 40 },
  ],
  spawns: [
    // Friendly carrier, decorative, sitting in the sea.
    { type: "carrier", x: -345, z: 250, heading: 0.3 },

    // Coastal radar station.
    { type: "radar", x: RADAR.x, z: RADAR.z, tag: "radar" },
    { type: "aa", x: RADAR.x + 22, z: RADAR.z + 14 },
    { type: "aa", x: RADAR.x - 20, z: RADAR.z - 16 },
    { type: "building", x: RADAR.x + 18, z: RADAR.z - 18, variant: 0 },
    { type: "building", x: RADAR.x - 22, z: RADAR.z + 16, variant: 1 },
    { type: "fuelDepot", x: RADAR.x - 8, z: RADAR.z + 26 },
    ...ring("infantry", RADAR.x, RADAR.z, 14, 4),
    { type: "lightTank", x: RADAR.x + 60, z: RADAR.z + 60, waypoints: [[RADAR.x + 60, RADAR.z + 60], [RADAR.x + 10, RADAR.z + 70], [RADAR.x - 40, RADAR.z + 40]] },

    // SAM sites.
    { type: "sam", x: SAM_A.x, z: SAM_A.z, tag: "sam" },
    { type: "aa", x: SAM_A.x + 16, z: SAM_A.z + 10 },
    ...ring("infantry", SAM_A.x, SAM_A.z, 10, 2),
    { type: "sam", x: SAM_B.x, z: SAM_B.z, tag: "sam" },
    { type: "lightTank", x: SAM_B.x - 30, z: SAM_B.z + 20, waypoints: [[SAM_B.x - 30, SAM_B.z + 20], [SAM_B.x + 30, SAM_B.z + 25], [SAM_B.x + 25, SAM_B.z - 30]] },
    { type: "building", x: SAM_B.x + 18, z: SAM_B.z - 14, variant: 2 },
    { type: "sam", x: SAM_C.x, z: SAM_C.z, tag: "sam" },
    { type: "aa", x: SAM_C.x - 16, z: SAM_C.z - 12 },
    { type: "aa", x: SAM_C.x + 18, z: SAM_C.z + 8 },
    ...ring("infantry", SAM_C.x, SAM_C.z, 10, 3),

    // Prison camp.
    { type: "prison", x: PRISON.x, z: PRISON.z, tag: "prison" },
    ...square(PRISON.x, PRISON.z, 26, 2),
    { type: "tank", x: PRISON.x + 36, z: PRISON.z + 40, waypoints: [[PRISON.x + 36, PRISON.z + 40], [PRISON.x - 40, PRISON.z + 42], [PRISON.x - 44, PRISON.z - 30]] },
    { type: "aa", x: PRISON.x, z: PRISON.z + 36 },
    { type: "aa", x: PRISON.x - 34, z: PRISON.z - 10 },
    ...ring("infantry", PRISON.x, PRISON.z, 16, 4),
    { type: "building", x: PRISON.x + 44, z: PRISON.z - 30, variant: 0 },

    // Headquarters.
    { type: "hq", x: HQ.x, z: HQ.z, tag: "hq" },
    { type: "aa", x: HQ.x + 26, z: HQ.z + 20 },
    { type: "aa", x: HQ.x - 28, z: HQ.z + 18 },
    { type: "aa", x: HQ.x, z: HQ.z - 30 },
    { type: "tank", x: HQ.x + 45, z: HQ.z - 10, waypoints: [[HQ.x + 45, HQ.z - 10], [HQ.x + 40, HQ.z + 45], [HQ.x - 40, HQ.z + 48]] },
    { type: "tank", x: HQ.x - 50, z: HQ.z - 20, waypoints: [[HQ.x - 50, HQ.z - 20], [HQ.x - 55, HQ.z - 60], [HQ.x + 20, HQ.z - 62]] },
    { type: "tank", x: HQ.x, z: HQ.z + 55 },
    { type: "building", x: HQ.x + 30, z: HQ.z - 26, variant: 1 },
    { type: "building", x: HQ.x - 30, z: HQ.z - 28, variant: 2 },
    { type: "fuelDepot", x: HQ.x + 40, z: HQ.z + 34 },
    { type: "fuelDepot", x: HQ.x + 46, z: HQ.z + 40 },
    ...ring("infantry", HQ.x, HQ.z, 20, 6),
    ...ring("tower", HQ.x, HQ.z, 42, 4),

    // Supply depot with volatile fuel tanks.
    { type: "building", x: DEPOT.x, z: DEPOT.z, variant: 1 },
    { type: "building", x: DEPOT.x + 20, z: DEPOT.z + 4, variant: 0 },
    { type: "building", x: DEPOT.x - 18, z: DEPOT.z + 12, variant: 2 },
    { type: "fuelDepot", x: DEPOT.x + 6, z: DEPOT.z - 20 },
    { type: "fuelDepot", x: DEPOT.x + 14, z: DEPOT.z - 22 },
    { type: "fuelDepot", x: DEPOT.x - 4, z: DEPOT.z - 24 },
    { type: "aa", x: DEPOT.x - 24, z: DEPOT.z - 14 },
    ...ring("infantry", DEPOT.x, DEPOT.z, 12, 3),

    // Villages.
    ...ring("building", VILLAGE_A.x, VILLAGE_A.z, 18, 5, { variant: 2 }),
    ...ring("infantry", VILLAGE_A.x, VILLAGE_A.z, 8, 2),
    { type: "lightTank", x: VILLAGE_A.x + 40, z: VILLAGE_A.z, waypoints: [[VILLAGE_A.x + 40, VILLAGE_A.z], [VILLAGE_A.x, VILLAGE_A.z + 45], [VILLAGE_A.x - 45, VILLAGE_A.z], [VILLAGE_A.x, VILLAGE_A.z - 45]] },
    ...ring("building", VILLAGE_B.x, VILLAGE_B.z, 16, 4, { variant: 0 }),
    { type: "fuelDepot", x: VILLAGE_B.x, z: VILLAGE_B.z },
    ...ring("infantry", VILLAGE_B.x, VILLAGE_B.z, 9, 2),

    // Roaming armour between compounds.
    { type: "tank", x: 100, z: -60, waypoints: [[100, -60], [160, -120], [60, -140], [-20, -20]] },
    { type: "lightTank", x: 20, z: 240, waypoints: [[20, 240], [90, 280], [200, 230], [80, 200]] },

    // Supplies.
    { type: "pickup", x: -120, z: 200, item: "fuel" },
    { type: "pickup", x: -40, z: -170, item: "fuel" },
    { type: "pickup", x: 150, z: -110, item: "fuel" },
    { type: "pickup", x: 70, z: 60, item: "fuel" },
    { type: "pickup", x: 240, z: 120, item: "fuel" },
    { type: "pickup", x: -200, z: -130, item: "fuel" },
    { type: "pickup", x: 330, z: -120, item: "fuel" },
    { type: "pickup", x: -90, z: 60, item: "ammo" },
    { type: "pickup", x: 110, z: -260, item: "ammo" },
    { type: "pickup", x: 200, z: -130, item: "ammo" },
    { type: "pickup", x: 0, z: 240, item: "ammo" },
    { type: "pickup", x: 300, z: 110, item: "ammo" },
    { type: "pickup", x: -160, z: -170, item: "armor" },
    { type: "pickup", x: 180, z: 220, item: "armor" },
    { type: "pickup", x: 90, z: -50, item: "armor" },
    { type: "pickup", x: 320, z: -300, item: "armor" },
  ],
  objectives: [
    { id: "radar", text: "Destroy the coastal radar station", total: 1, doneMessage: "Radar station destroyed. Their network is blind." },
    { id: "sams", text: "Destroy all three SAM sites", total: 3, doneMessage: "All SAM sites down. Airspace is ours." },
    { id: "pows", text: "Level the prison and rescue 4 POWs to the LZ", total: 4, doneMessage: "All POWs recovered. Outstanding flying." },
    { id: "hq", text: "Destroy the enemy headquarters bunker", total: 1, doneMessage: "HQ bunker destroyed. Their command is gone." },
    { id: "return", text: "Return to the landing zone", total: 1, final: true, doneMessage: "Welcome home. Mission complete." },
  ],
};
