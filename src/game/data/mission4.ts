import { ring, type MissionData } from "./mission";
import { gulfTheme } from "../world/Theme";

/*
 * Operation Narrow Water. A strait runs north to south through the map with
 * arid mountains on both shores. Tankers enter from the south and follow the
 * marked lane north; minelayers cross ahead of them, gunboats work out of a
 * naval base on the north-east shore, and anti-ship batteries sit on the
 * cliffs. The friendly landing zone is on a headland in the south-west.
 */
const BASE = { x: -230, z: 300 };
const ISLAND = { x: 60, z: -250 };
const NAVAL = { x: 200, z: -260 };
const QUAY = { x: 128, z: -250 };
const RIG = { x: 100, z: -140 };
const BAT_W1 = { x: -190, z: -80 };
const BAT_E = { x: 190, z: 60 };
const BAT_W2 = { x: -195, z: 110 };
const VILLAGE = { x: 180, z: 220 };
/** Shipping lane, south entrance to north exit. */
const LANE: [number, number][] = [
  [0, 380],
  [5, 250],
  [15, 100],
  [25, -50],
  [5, -200],
  [-5, -330],
  [-5, -400],
];

export const mission4: MissionData = {
  id: "narrowwater",
  name: "Operation Narrow Water",
  codename: "NARROW WATER",
  summary: "Strait of Hormuz. Sink the minelayers, sweep the lane, shepherd two tankers through under fire from gunboats and cliff-top batteries, then burn the naval base.",
  seed: 2001,
  music: "march-of-the-sands",
  theme: gulfTheme,
  terrain: {
    shape: "gulf",
    river: {
      points: [
        [0, -440, 120],
        [-10, -300, 115],
        [10, -150, 105],
        [30, 0, 100],
        [10, 150, 110],
        [-20, 300, 120],
        [-30, 440, 125],
      ],
      bed: -9,
      bank: 22,
    },
    islands: [
      { x: ISLAND.x, z: ISLAND.z, r: 48, h: 9 },
      { x: -70, z: 120, r: 22, h: 5 },
    ],
  },
  briefing: [
    "Two laden tankers are coming up the strait tonight, and the far shore intends that they never leave it. Minelayers are seeding the lane, gunboats work out of a naval base on the north-east shore, and anti-ship batteries look down from the cliffs.",
    "The tankers will not stop. They enter from the south at first light and steam north up the marked lane at a walking pace, so everything ahead of them has to be dealt with before they reach it.",
    "Take the radar on the island first so the picture opens up. Sink both minelayers, then sweep whatever they have already dropped: a mine will show on radar, and one round is enough.",
    "The batteries on the cliffs and the gunboats will go for the tankers as readily as for you. Keep the ships alive until both are clear at the northern exit, then level the base and come home to the headland.",
    "Fuel and ammunition are cached on both shores and on the island. The water is wide, so watch the gauge.",
  ],
  base: BASE,
  lz: { x: BASE.x, z: BASE.z, r: 14 },
  flats: [
    { x: BASE.x, z: BASE.z, r: 45, h: 6 },
    { x: ISLAND.x, z: ISLAND.z, r: 30, h: 8 },
    { x: NAVAL.x, z: NAVAL.z, r: 70 },
    { x: QUAY.x + 8, z: QUAY.z, r: 30, h: 2.8 },
    { x: BAT_W1.x, z: BAT_W1.z, r: 28 },
    { x: BAT_E.x, z: BAT_E.z, r: 26 },
    { x: BAT_W2.x, z: BAT_W2.z, r: 28 },
    { x: VILLAGE.x, z: VILLAGE.z, r: 40 },
  ],
  decor: [
    { kind: "buoys", x: 0, z: 0, heading: 0, width: 28, points: LANE },
    { kind: "rig", x: RIG.x, z: RIG.z, heading: 0.3 },
    { kind: "quay", x: QUAY.x, z: QUAY.z, heading: Math.PI / 2, length: 90 },
  ],
  spawns: [
    // The tankers, one lane, staggered.
    { type: "tanker", x: LANE[0][0], z: LANE[0][1], heading: Math.PI, waypoints: LANE.slice(1) },
    { type: "tanker", x: LANE[0][0] - 12, z: LANE[0][1] + 70, heading: Math.PI, waypoints: LANE.slice(1) },

    // Minelayers crossing the lane ahead of them.
    { type: "minelayer", x: -70, z: -100, heading: Math.PI / 2, tag: "minelayer", waypoints: [[-70, -100], [80, -90]] },
    { type: "minelayer", x: 90, z: 60, heading: -Math.PI / 2, tag: "minelayer", waypoints: [[90, 60], [-60, 50]] },

    // Island radar.
    { type: "radar", x: ISLAND.x, z: ISLAND.z, heading: 0.4, tag: "radar" },
    { type: "aa", x: ISLAND.x + 18, z: ISLAND.z + 10 },
    { type: "aa", x: ISLAND.x - 16, z: ISLAND.z - 12 },
    ...ring("infantry", ISLAND.x, ISLAND.z, 14, 3),

    // Naval base with its quay and boats.
    { type: "hq", x: NAVAL.x, z: NAVAL.z, heading: -0.3, tag: "hq" },
    ...ring("tower", NAVAL.x, NAVAL.z, 40, 4),
    { type: "aa", x: NAVAL.x - 30, z: NAVAL.z + 20 },
    { type: "aa", x: NAVAL.x + 26, z: NAVAL.z - 24 },
    { type: "aa", x: QUAY.x + 10, z: QUAY.z + 40 },
    { type: "building", x: NAVAL.x + 30, z: NAVAL.z + 20, variant: 0 },
    { type: "building", x: NAVAL.x - 26, z: NAVAL.z - 30, variant: 1 },
    { type: "fuelDepot", x: NAVAL.x + 40, z: NAVAL.z - 6 },
    { type: "fuelDepot", x: NAVAL.x + 46, z: NAVAL.z + 2 },
    ...ring("infantry", NAVAL.x, NAVAL.z, 20, 5),
    { type: "gunboat", x: 100, z: -330, heading: 0, waypoints: [[100, -330], [95, -200], [40, -300]] },
    { type: "gunboat", x: 60, z: -190, heading: 0, waypoints: [[60, -190], [-40, -120], [30, -60]] },
    { type: "gunboat", x: -30, z: 200, heading: 0, waypoints: [[-30, 200], [60, 240], [40, 120], [-60, 160]] },

    // Anti-ship batteries on the cliffs.
    { type: "sam", x: BAT_W1.x, z: BAT_W1.z, tag: "battery" },
    { type: "aa", x: BAT_W1.x + 18, z: BAT_W1.z + 14 },
    ...ring("infantry", BAT_W1.x, BAT_W1.z, 11, 2),
    { type: "sam", x: BAT_E.x, z: BAT_E.z, tag: "battery" },
    { type: "aa", x: BAT_E.x + 16, z: BAT_E.z - 14 },
    ...ring("infantry", BAT_E.x, BAT_E.z, 11, 2),
    { type: "sam", x: BAT_W2.x, z: BAT_W2.z, tag: "battery" },
    { type: "aa", x: BAT_W2.x - 16, z: BAT_W2.z + 14 },
    { type: "lightTank", x: BAT_W2.x + 40, z: BAT_W2.z - 40, waypoints: [[BAT_W2.x + 40, BAT_W2.z - 40], [BAT_W2.x + 30, BAT_W2.z + 50], [BAT_W2.x - 50, BAT_W2.z + 40]] },

    // Fishing village on the east shore.
    ...ring("building", VILLAGE.x, VILLAGE.z, 16, 4, { variant: 2 }),
    ...ring("infantry", VILLAGE.x, VILLAGE.z, 8, 2),
    { type: "jeep", x: VILLAGE.x + 40, z: VILLAGE.z - 40, waypoints: [[VILLAGE.x + 40, VILLAGE.z - 40], [VILLAGE.x + 60, VILLAGE.z + 40], [VILLAGE.x - 20, VILLAGE.z + 60]] },

    // Supplies on both shores and the island.
    { type: "pickup", x: -180, z: 220, item: "fuel" },
    { type: "pickup", x: -220, z: 40, item: "fuel" },
    { type: "pickup", x: -190, z: -200, item: "fuel" },
    { type: "pickup", x: ISLAND.x - 24, z: ISLAND.z + 18, item: "fuel" },
    { type: "pickup", x: 240, z: -120, item: "fuel" },
    { type: "pickup", x: 250, z: 140, item: "fuel" },
    { type: "pickup", x: 160, z: 320, item: "fuel" },
    { type: "pickup", x: -150, z: 330, item: "ammo" },
    { type: "pickup", x: -240, z: -280, item: "ammo" },
    { type: "pickup", x: 270, z: -320, item: "ammo" },
    { type: "pickup", x: 230, z: 40, item: "ammo" },
    { type: "pickup", x: -70, z: 120, item: "armor" },
    { type: "pickup", x: 280, z: -200, item: "armor" },
    { x: -160, z: 100, type: "pickup", item: "armor" },
  ],
  objectives: [
    { id: "radar", kind: "destroyTag", tag: "radar", effect: "radarDown", text: "Destroy the island radar", total: 1, doneMessage: "Island radar destroyed. The whole strait is on your screen." },
    { id: "layers", kind: "destroyTag", tag: "minelayer", text: "Sink both minelayers", total: 2, doneMessage: "Both minelayers on the bottom. Now sweep what they left." },
    { id: "escort", kind: "escort", text: "Get the tankers through the strait", total: 2, failMessage: "Both tankers went down in the strait.", doneMessage: "Tankers clear of the strait. That is the job done." },
    { id: "batteries", kind: "destroyTag", tag: "battery", text: "Destroy the three coastal batteries", total: 3, doneMessage: "Cliff batteries silenced." },
    { id: "base", kind: "destroyTag", tag: "hq", text: "Destroy the naval base command post", total: 1, doneMessage: "Naval base command destroyed. Nothing sails from there again." },
    { id: "return", kind: "returnToLZ", text: "Return to the landing zone", total: 1, final: true, doneMessage: "Welcome home. Mission complete." },
  ],
};
