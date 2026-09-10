import { ring, type MissionData } from "./mission";
import { arcticTheme } from "../world/Theme";

/*
 * Operation White Silence. A frozen sea along the west edge, the friendly
 * landing zone on the ice shelf beside it, snowfields and pressure ridges
 * rising eastward to a missile field and its launch control bunker.
 */
const BASE = { x: -215, z: 240 };
const RADOME_A = { x: -170, z: -250 };
const RADOME_B = { x: 250, z: -130 };
const HQ = { x: 300, z: 220 };
const DEPOT = { x: -60, z: -300 };
const CRASH = { x: -60, z: 140 };
const SILOS = { x: 150, z: -30 };
const SILO_A = { x: 120, z: -60 };
const SILO_B = { x: 185, z: -45 };
const SILO_C = { x: 150, z: 10 };
/** Supply road from the depot round the silo field and back. */
const ROUTE: [number, number][] = [
  [-60, -300],
  [60, -230],
  [150, -140],
  [235, -40],
  [165, 62],
  [40, 32],
  [-80, -120],
];
const rotate = (pts: [number, number][], k: number): [number, number][] => [...pts.slice(k), ...pts.slice(0, k)];

export const mission3: MissionData = {
  id: "whitesilence",
  name: "Operation White Silence",
  codename: "WHITE SILENCE",
  summary: "Arctic missile field. Blind the radomes, kill the launch control, cut the fuel convoy, pull a transport crew off the ice and destroy three silos before they can launch.",
  seed: 1997,
  music: "iron-sector-run",
  theme: arcticTheme,
  terrain: { shape: "arctic", coast: { edgeX: -270, floor: -9 } },
  briefing: [
    "Three intercontinental missile silos have gone live on the polar plateau, with a launch control bunker to the east and two early-warning radomes covering the approach.",
    "A transport carrying the recon team went down on the ice on the way in. The three crew are alive at the wreck, and a patrol is closing on them.",
    "Blind the radomes first. The silos are fuelled from a depot by road convoy: cut the convoy and destroy the launch control bunker before you touch the silos, because the moment one silo is hit the others start their launch sequence.",
    "If the bunker is gone, no launch order can be given. If it still stands when you strike the first silo, you have two and a half minutes to finish the other two.",
    "The wind is brutal and the fuel burns fast. Drums and crates are laid along the road and at the wreck. Recover the crew, level the field, and come home over the ice.",
  ],
  base: BASE,
  lz: { x: BASE.x, z: BASE.z, r: 14 },
  flats: [
    { x: BASE.x, z: BASE.z, r: 45, h: 1.4 },
    { x: RADOME_A.x, z: RADOME_A.z, r: 40 },
    { x: RADOME_B.x, z: RADOME_B.z, r: 40 },
    { x: HQ.x, z: HQ.z, r: 75 },
    { x: DEPOT.x, z: DEPOT.z, r: 45 },
    { x: CRASH.x, z: CRASH.z, r: 42, h: 3 },
    { x: SILOS.x, z: SILOS.z, r: 92 },
    { x: 60, z: -230, r: 24 },
    { x: 165, z: 62, r: 24 },
    { x: 40, z: 32, r: 24 },
    { x: -80, z: -120, r: 24 },
  ],
  decor: [
    { kind: "floes", x: -345, z: 0, heading: 0, width: 120, length: 780, count: 70 },
    { kind: "crash", x: CRASH.x, z: CRASH.z, heading: 0.9 },
  ],
  spawns: [
    // Early-warning radomes.
    { type: "radome", x: RADOME_A.x, z: RADOME_A.z, heading: 0.3, tag: "radar" },
    { type: "aa", x: RADOME_A.x + 20, z: RADOME_A.z + 14 },
    { type: "aa", x: RADOME_A.x - 22, z: RADOME_A.z - 12 },
    ...ring("infantry", RADOME_A.x, RADOME_A.z, 13, 3),
    { type: "radome", x: RADOME_B.x, z: RADOME_B.z, heading: -0.4, tag: "radar" },
    { type: "aa", x: RADOME_B.x + 18, z: RADOME_B.z - 16 },
    { type: "sam", x: RADOME_B.x - 26, z: RADOME_B.z + 10 },
    ...ring("infantry", RADOME_B.x, RADOME_B.z, 13, 3),

    // Launch control bunker.
    { type: "hq", x: HQ.x, z: HQ.z, tag: "hq" },
    ...ring("tower", HQ.x, HQ.z, 42, 4),
    { type: "sam", x: HQ.x + 30, z: HQ.z - 26 },
    { type: "sam", x: HQ.x - 32, z: HQ.z + 24 },
    { type: "aa", x: HQ.x, z: HQ.z - 32 },
    { type: "aa", x: HQ.x + 28, z: HQ.z + 24 },
    { type: "tank", x: HQ.x - 50, z: HQ.z - 20, waypoints: [[HQ.x - 50, HQ.z - 20], [HQ.x - 55, HQ.z + 50], [HQ.x + 45, HQ.z + 52], [HQ.x + 50, HQ.z - 50]] },
    { type: "jeep", x: HQ.x + 60, z: HQ.z, waypoints: [[HQ.x + 60, HQ.z], [HQ.x, HQ.z + 62], [HQ.x - 62, HQ.z], [HQ.x, HQ.z - 62]] },
    { type: "building", x: HQ.x + 32, z: HQ.z + 4, variant: 1 },
    ...ring("infantry", HQ.x, HQ.z, 20, 5),

    // Fuel depot and the convoy that runs from it.
    { type: "building", x: DEPOT.x, z: DEPOT.z, variant: 0 },
    { type: "building", x: DEPOT.x - 22, z: DEPOT.z + 10, variant: 1 },
    { type: "fuelDepot", x: DEPOT.x + 14, z: DEPOT.z - 18 },
    { type: "fuelDepot", x: DEPOT.x + 22, z: DEPOT.z - 14 },
    { type: "aa", x: DEPOT.x - 20, z: DEPOT.z - 18 },
    ...ring("infantry", DEPOT.x, DEPOT.z, 12, 3),
    { type: "truck", x: ROUTE[0][0], z: ROUTE[0][1], tag: "convoy", waypoints: rotate(ROUTE, 1) },
    { type: "truck", x: ROUTE[1][0], z: ROUTE[1][1], tag: "convoy", waypoints: rotate(ROUTE, 2) },
    { type: "truck", x: ROUTE[3][0], z: ROUTE[3][1], tag: "convoy", waypoints: rotate(ROUTE, 4) },
    { type: "truck", x: ROUTE[5][0], z: ROUTE[5][1], tag: "convoy", waypoints: rotate(ROUTE, 6) },
    { type: "jeep", x: ROUTE[2][0], z: ROUTE[2][1], waypoints: rotate(ROUTE, 3) },

    // The downed transport and its crew.
    { type: "pow", x: CRASH.x - 4, z: CRASH.z + 6 },
    { type: "pow", x: CRASH.x + 5, z: CRASH.z + 2 },
    { type: "pow", x: CRASH.x - 2, z: CRASH.z - 6 },
    ...ring("infantry", CRASH.x, CRASH.z, 26, 4),
    { type: "aa", x: CRASH.x + 28, z: CRASH.z - 18 },
    { type: "jeep", x: CRASH.x - 40, z: CRASH.z + 30, waypoints: [[CRASH.x - 40, CRASH.z + 30], [CRASH.x + 40, CRASH.z + 34], [CRASH.x + 44, CRASH.z - 34], [CRASH.x - 42, CRASH.z - 36]] },

    // The missile field.
    { type: "silo", x: SILO_A.x, z: SILO_A.z, heading: 0.2, tag: "silo" },
    { type: "silo", x: SILO_B.x, z: SILO_B.z, heading: -0.5, tag: "silo" },
    { type: "silo", x: SILO_C.x, z: SILO_C.z, heading: 1.1, tag: "silo" },
    { type: "sam", x: SILOS.x - 62, z: SILOS.z + 20 },
    { type: "sam", x: SILOS.x + 62, z: SILOS.z - 50 },
    { type: "sam", x: SILOS.x + 55, z: SILOS.z + 60 },
    { type: "aa", x: SILOS.x - 30, z: SILOS.z - 65 },
    { type: "aa", x: SILOS.x + 20, z: SILOS.z + 70 },
    { type: "aa", x: SILOS.x + 70, z: SILOS.z + 5 },
    { type: "tank", x: SILOS.x - 60, z: SILOS.z - 40, waypoints: [[SILOS.x - 60, SILOS.z - 40], [SILOS.x + 60, SILOS.z - 75], [SILOS.x + 75, SILOS.z + 40], [SILOS.x - 40, SILOS.z + 65]] },
    { type: "building", x: SILOS.x - 10, z: SILOS.z - 80, variant: 1 },
    ...ring("infantry", SILOS.x, SILOS.z, 30, 6),

    // Roaming jeeps.
    { type: "jeep", x: -150, z: -60, waypoints: [[-150, -60], [-40, -20], [-30, -180], [-170, -150]] },
    { type: "jeep", x: 240, z: 100, waypoints: [[240, 100], [330, 40], [340, 130], [250, 160]] },

    // Supplies, mostly fuel and armour.
    { type: "pickup", x: -150, z: 180, item: "fuel" },
    { type: "pickup", x: -120, z: -180, item: "fuel" },
    { type: "pickup", x: 20, z: -200, item: "fuel" },
    { type: "pickup", x: 200, z: -220, item: "fuel" },
    { type: "pickup", x: 100, z: 120, item: "fuel" },
    { type: "pickup", x: 260, z: 20, item: "fuel" },
    { type: "pickup", x: -200, z: 40, item: "fuel" },
    { type: "pickup", x: 320, z: -260, item: "fuel" },
    { type: "pickup", x: -30, z: 40, item: "ammo" },
    { type: "pickup", x: 60, z: -120, item: "ammo" },
    { type: "pickup", x: 320, z: 120, item: "ammo" },
    { type: "pickup", x: -120, z: 300, item: "ammo" },
    { type: "pickup", x: -20, z: 220, item: "armor" },
    { type: "pickup", x: 220, z: 320, item: "armor" },
    { type: "pickup", x: 40, z: -320, item: "armor" },
    { type: "pickup", x: 200, z: -120, item: "armor" },
  ],
  objectives: [
    { id: "radars", kind: "destroyTag", tag: "radar", effect: "radarDown", text: "Blind both early-warning radomes", total: 2, doneMessage: "Radomes down. They are blind up here now." },
    { id: "bunker", kind: "destroyTag", tag: "hq", text: "Destroy the launch control bunker", total: 1, doneMessage: "Launch control destroyed. No order can reach the silos." },
    { id: "convoy", kind: "destroyTag", tag: "convoy", text: "Destroy the fuel convoy", total: 4, doneMessage: "Convoy burning on the road. The silos run dry from here." },
    { id: "crew", kind: "rescue", text: "Recover the transport crew from the wreck", total: 3, doneMessage: "Transport crew recovered. Good work in that wind." },
    {
      id: "silos",
      kind: "destroyTag",
      tag: "silo",
      text: "Destroy the three missile silos",
      total: 3,
      deadline: { seconds: 150, label: "LAUNCH IN", failMessage: "The missiles launched. Nothing left to do here.", cancelledBy: "bunker" },
      doneMessage: "All three silos destroyed. The field is finished.",
    },
    { id: "return", kind: "returnToLZ", text: "Return to the landing zone", total: 1, final: true, doneMessage: "Welcome home. Mission complete." },
  ],
};
