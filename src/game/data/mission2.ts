import { ring, type MissionData } from "./mission";
import { jungleTheme } from "../world/Theme";

/*
 * Operation Green Fang. A river enters at the north edge, swells into a
 * reservoir above the dam, then winds south-east across the map. Every
 * installation sits in a clearing on one bank or the other.
 */
const BASE = { x: -260, z: 250 };
const RUIN = { x: -170, z: -40 };
const GEN = { x: 50, z: -126 };
const DAM = { x: 6, z: -138, heading: Math.atan2(30, 60) };
const SAM_N = { x: -120, z: -300 };
const SAM_S = { x: 120, z: 90 };
const VILLAGE = { x: 52, z: 42 };
const DEPOT = { x: 250, z: -200 };
const AIRSTRIP = { x: 150, z: 250, heading: 1.2 };
/** Runway axis and its perpendicular, for laying out the field. */
const AX = { x: Math.sin(AIRSTRIP.heading), z: Math.cos(AIRSTRIP.heading) };
const PX = { x: AX.z, z: -AX.x };
const field = (along: number, across: number) => ({ x: AIRSTRIP.x + AX.x * along + PX.x * across, z: AIRSTRIP.z + AX.z * along + PX.z * across });
const H1 = field(-25, 24);
const H2 = field(8, 24);
const DUMP = field(38, 26);
const TOWER = field(-12, -22);

export const mission2: MissionData = {
  id: "greenfang",
  name: "Operation Green Fang",
  codename: "GREEN FANG",
  summary: "Jungle river valley. Sink the gunboats, black out the dam, pull a recon crew out of a temple ruin and burn the hidden airstrip.",
  seed: 1994,
  music: "jungle-advance",
  theme: jungleTheme,
  terrain: {
    shape: "jungle",
    river: {
      points: [
        [-70, -430, 14],
        [-60, -300, 16],
        [-40, -230, 34],
        [-20, -175, 30],
        [0, -150, 14],
        [30, -90, 14],
        [80, -20, 15],
        [150, 40, 14],
        [230, 120, 16],
        [300, 220, 15],
        [380, 330, 14],
        [440, 410, 14],
      ],
      bed: -5,
      bank: 14,
    },
  },
  briefing: [
    "A recon flight went down in the river valley three nights ago. The crew are alive and holed up in a temple ruin west of the river, with a patrol closing in.",
    "The valley is defended from the water. Patrol gunboats run the river, and a hydroelectric dam feeds every gun and missile battery along its banks.",
    "Sink the gunboats, then hit the generator at the dam: with the grid down the river defences go quiet. Pull the crew out of the ruin and bring them home.",
    "Intelligence has also found the airstrip they are flying supplies into, cut into the canopy south of the river. Level both hangars and the fuel dump, then return to the landing zone.",
    "The canopy hides the ground. Fuel drums and crates sit in the clearings and along the banks, so watch the radar and keep the tanks topped up.",
  ],
  base: BASE,
  lz: { x: BASE.x, z: BASE.z, r: 14 },
  flats: [
    { x: BASE.x, z: BASE.z, r: 45, h: 9 },
    { x: RUIN.x, z: RUIN.z, r: 40 },
    { x: GEN.x, z: GEN.z, r: 18 },
    { x: SAM_N.x, z: SAM_N.z, r: 30 },
    { x: SAM_S.x, z: SAM_S.z, r: 30 },
    { x: VILLAGE.x, z: VILLAGE.z, r: 32 },
    { x: DEPOT.x, z: DEPOT.z, r: 45 },
    { x: AIRSTRIP.x, z: AIRSTRIP.z, r: 92 },
  ],
  decor: [
    { kind: "dam", x: DAM.x, z: DAM.z, heading: DAM.heading, length: 50 },
    { kind: "ruin", x: RUIN.x, z: RUIN.z, heading: 0.5 },
    { kind: "runway", x: AIRSTRIP.x, z: AIRSTRIP.z, heading: AIRSTRIP.heading, length: 130, width: 18 },
  ],
  spawns: [
    // River patrol.
    { type: "gunboat", x: -58, z: -300, heading: 0, tag: "gunboat", waypoints: [[-58, -300], [-30, -180]] },
    { type: "gunboat", x: 40, z: -75, heading: 0.6, tag: "gunboat", waypoints: [[40, -75], [120, 15], [200, 90]] },
    { type: "gunboat", x: 260, z: 160, heading: 0.6, tag: "gunboat", waypoints: [[260, 160], [340, 280]] },

    // The dam and its powerhouse, guarded by grid-fed guns.
    { type: "generator", x: GEN.x, z: GEN.z, heading: -0.2, tag: "generator" },
    { type: "aa", x: GEN.x + 22, z: GEN.z - 14, powered: true },
    { type: "aa", x: GEN.x + 18, z: GEN.z + 20, powered: true },
    { type: "sam", x: GEN.x + 40, z: GEN.z + 4, powered: true },
    ...ring("infantry", GEN.x + 14, GEN.z, 12, 3),

    // Missile batteries on the banks, both on the grid.
    { type: "sam", x: SAM_N.x, z: SAM_N.z, powered: true },
    { type: "aa", x: SAM_N.x + 18, z: SAM_N.z + 12, powered: true },
    { type: "aa", x: -100, z: -250, powered: true },
    ...ring("infantry", SAM_N.x, SAM_N.z, 10, 2),
    { type: "sam", x: SAM_S.x, z: SAM_S.z, powered: true },
    { type: "aa", x: SAM_S.x - 16, z: SAM_S.z + 14, powered: true },
    { type: "aa", x: 0, z: -40, powered: true },
    { type: "aa", x: 210, z: 40, powered: true },
    { type: "aa", x: 330, z: 190, powered: true },

    // Temple ruin: the downed crew, and the patrol closing on them.
    { type: "pow", x: RUIN.x + 4, z: RUIN.z + 3 },
    { type: "pow", x: RUIN.x - 5, z: RUIN.z + 6 },
    { type: "pow", x: RUIN.x + 2, z: RUIN.z - 6 },
    ...ring("infantry", RUIN.x, RUIN.z, 22, 5),
    { type: "aa", x: RUIN.x - 26, z: RUIN.z + 18 },
    { type: "lightTank", x: RUIN.x + 40, z: RUIN.z + 30, waypoints: [[RUIN.x + 40, RUIN.z + 30], [RUIN.x + 45, RUIN.z - 30], [RUIN.x - 40, RUIN.z - 40], [RUIN.x - 45, RUIN.z + 35]] },

    // River village on the east bank.
    ...ring("building", VILLAGE.x, VILLAGE.z, 16, 4, { variant: 2 }),
    ...ring("infantry", VILLAGE.x, VILLAGE.z, 8, 2),
    { type: "fuelDepot", x: VILLAGE.x + 4, z: VILLAGE.z - 2 },

    // Supply depot in the north-east.
    { type: "building", x: DEPOT.x, z: DEPOT.z, variant: 1 },
    { type: "building", x: DEPOT.x + 22, z: DEPOT.z + 6, variant: 0 },
    { type: "fuelDepot", x: DEPOT.x - 6, z: DEPOT.z - 22 },
    { type: "fuelDepot", x: DEPOT.x + 4, z: DEPOT.z - 24 },
    { type: "aa", x: DEPOT.x - 24, z: DEPOT.z + 10 },
    ...ring("infantry", DEPOT.x, DEPOT.z, 12, 3),
    { type: "tank", x: DEPOT.x - 60, z: DEPOT.z + 40, waypoints: [[DEPOT.x - 60, DEPOT.z + 40], [DEPOT.x + 50, DEPOT.z + 60], [DEPOT.x + 60, DEPOT.z - 40]] },

    // The hidden airstrip.
    { type: "building", x: H1.x, z: H1.z, heading: AIRSTRIP.heading, variant: 0, tag: "airstrip" },
    { type: "building", x: H2.x, z: H2.z, heading: AIRSTRIP.heading, variant: 0, tag: "airstrip" },
    { type: "fuelDepot", x: DUMP.x, z: DUMP.z, tag: "airstrip" },
    { type: "tower", x: TOWER.x, z: TOWER.z },
    { type: "aa", x: field(-58, -16).x, z: field(-58, -16).z },
    { type: "aa", x: field(58, 18).x, z: field(58, 18).z },
    { type: "tank", x: field(-40, -40).x, z: field(-40, -40).z, waypoints: [[field(-40, -40).x, field(-40, -40).z], [field(50, -40).x, field(50, -40).z], [field(50, 50).x, field(50, 50).z]] },
    ...ring("infantry", AIRSTRIP.x, AIRSTRIP.z, 34, 4),

    // Roaming armour clear of the water.
    { type: "tank", x: -200, z: -150, waypoints: [[-200, -150], [-120, -200], [-150, -100]] },
    { type: "lightTank", x: 280, z: -60, waypoints: [[280, -60], [340, 20], [260, 60]] },

    // Supplies, mostly fuel: the canopy makes every detour expensive.
    { type: "pickup", x: -200, z: 150, item: "fuel" },
    { type: "pickup", x: -120, z: -120, item: "fuel" },
    { type: "pickup", x: -20, z: -330, item: "fuel" },
    { type: "pickup", x: 120, z: -140, item: "fuel" },
    { type: "pickup", x: 200, z: 0, item: "fuel" },
    { type: "pickup", x: 320, z: 100, item: "fuel" },
    { type: "pickup", x: 40, z: 180, item: "fuel" },
    { type: "pickup", x: -300, z: -250, item: "fuel" },
    { type: "pickup", x: -100, z: 60, item: "ammo" },
    { type: "pickup", x: 160, z: -300, item: "ammo" },
    { type: "pickup", x: 300, z: -120, item: "ammo" },
    { type: "pickup", x: -60, z: 320, item: "ammo" },
    { type: "pickup", x: -240, z: -60, item: "armor" },
    { type: "pickup", x: 240, z: 320, item: "armor" },
    { type: "pickup", x: 100, z: -220, item: "armor" },
  ],
  objectives: [
    { id: "boats", kind: "destroyTag", tag: "gunboat", text: "Sink the three river gunboats", total: 3, doneMessage: "River is clear. No more gunboats on the water." },
    { id: "dam", kind: "destroyTag", tag: "generator", effect: "blackout", text: "Destroy the dam generator to black out the river defences", total: 1, doneMessage: "Generator destroyed." },
    { id: "crew", kind: "rescue", text: "Rescue the recon crew from the temple ruin", total: 3, doneMessage: "Recon crew recovered. That is why we fly." },
    { id: "airstrip", kind: "destroyTag", tag: "airstrip", text: "Destroy the airstrip: both hangars and the fuel dump", total: 3, doneMessage: "Airstrip is burning. Nothing lands there again." },
    { id: "return", kind: "returnToLZ", text: "Return to the landing zone", total: 1, final: true, doneMessage: "Welcome home. Mission complete." },
  ],
};
