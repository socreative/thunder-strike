import { ring, square, type MissionData } from "./mission";
import { islandProfile } from "../world/Terrain";
import { swampTheme } from "../world/Theme";

/*
 * Operation Black Water. A bayou: pools and mud banks under cypress, one
 * channel winding through it, and a handful of hummocks that stay dry. A
 * wartime research station was dug into the biggest of them and the enemy
 * has reopened it. Its old garrison has been coming up out of the ground
 * around three concrete crypts. Six surveyors are trapped in a stilt village
 * on the west shore with the dead wading toward them.
 */

interface Hummock {
  x: number;
  z: number;
  r: number;
  h: number;
}

/** The landing zone, a dry rise in the south-west. */
const LANDING: Hummock = { x: -260, z: 260, r: 55, h: 7 };
/** The laboratory hummock, the highest ground on the map. */
const STATION: Hummock = { x: 220, z: -120, r: 75, h: 12 };
/** The radio mast. */
const MAST: Hummock = { x: 150, z: 170, r: 45, h: 9 };
/** Three burial mounds, each with its crypt. */
const CRYPT_A: Hummock = { x: -120, z: 10, r: 45, h: 6.5 };
const CRYPT_B: Hummock = { x: 200, z: -240, r: 45, h: 7 };
const CRYPT_C: Hummock = { x: -60, z: 300, r: 45, h: 6.5 };

const HUMMOCKS = [LANDING, STATION, MAST, CRYPT_A, CRYPT_B, CRYPT_C];

/** Height for a pad on a hummock: just proud of the dome at that distance from its peak. */
function pad(h: Hummock, x: number, z: number): number {
  return h.h * islandProfile(h.r, Math.hypot(x - h.x, z - h.z)) * 1.2;
}

/** The stilt village and the two dry banks its people are standing on. */
const VILLAGE = { x: -150, z: 70 };
const BANK_A = { x: -150, z: 26 };
const BANK_B = { x: -116, z: 90 };

export const mission6: MissionData = {
  id: "blackwater",
  name: "Operation Black Water",
  codename: "BLACK WATER",
  summary: "A bayou of pools and mud under cypress. Blind the radio mast, burn three crypts the dead keep walking out of, lift six surveyors off a stilt village, sink the channel gunboats and destroy the laboratory.",
  briefing: [
    "Sixty years ago somebody dug a research station into the one high hummock in this marsh and left it. The enemy has reopened it, and whatever they have restarted down there has not stayed in the ground. The old garrison is walking again, and it does not stop for small arms.",
    "Start with the radio mast on the rise south of the station. It is the only link they have out of the bayou. With it down, nothing they see leaves the marsh.",
    "The dead come up out of three concrete crypts in the old burial mounds, and they keep coming while a crypt stands. Burn all three. They are slow and they cannot fly, but they will wade, and they will climb anything that hangs still over them. Stay moving and they are harmless. Slow down to winch and they are on the skids.",
    "A survey party of six is trapped on the stilt village on the west shore, on the two dry banks at its landward end. The dead are already in the water below them. Thin the horde before you go in, then lift the six and bring them home. You can carry all of them at once.",
    "Three gunboats work the channel through the middle of the marsh, and the station itself is walled and under flak, with armour on the causeway between it and the northern crypt. Break the laboratory last, then return to the landing zone. Fuel is cached on the dry ground; there is no dry ground anywhere else.",
  ],
  seed: 6606,
  music: "swamp-march",
  theme: swampTheme,
  terrain: {
    shape: "swamp",
    // The channel the gunboats work: north to south through the middle of the marsh.
    river: {
      points: [
        [-30, -400, 18],
        [-10, -300, 20],
        [30, -210, 20],
        [90, -120, 18],
        [60, -20, 20],
        [0, 60, 22],
        [-20, 160, 20],
        [20, 260, 18],
        [60, 340, 18],
        [80, 400, 18],
      ],
      bed: -5,
      bank: 10,
    },
    islands: HUMMOCKS.map((h) => ({ x: h.x, z: h.z, r: h.r, h: h.h })),
  },
  decor: [
    // The village stands over a pool at the foot of the landing hummock's far side.
    { kind: "village", x: VILLAGE.x, z: VILLAGE.z, heading: 0, count: 8, width: 40, length: 56 },
    // Burial grounds beside each crypt.
    { kind: "graves", x: CRYPT_A.x - 22, z: CRYPT_A.z + 8, heading: 0.3, count: 28, width: 26, length: 34 },
    { kind: "graves", x: CRYPT_B.x + 20, z: CRYPT_B.z + 12, heading: -0.6, count: 30, width: 28, length: 36 },
    { kind: "graves", x: CRYPT_C.x + 18, z: CRYPT_C.z - 14, heading: 2.2, count: 26, width: 26, length: 32 },
    // A collapsed annex of the station on the hummock's eastern slope.
    { kind: "ruin", x: 268, z: -84, heading: 0.9 },
  ],
  base: { x: LANDING.x, z: LANDING.z },
  lz: { x: LANDING.x, z: LANDING.z, r: 14 },
  flats: [
    // Landing zone, levelled right across.
    { x: LANDING.x, z: LANDING.z, r: 34, h: pad(LANDING, LANDING.x, LANDING.z) },
    // Station compound: wide enough for the walls and towers.
    { x: STATION.x, z: STATION.z, r: 38, h: pad(STATION, STATION.x, STATION.z) },
    // Mast summit.
    { x: MAST.x, z: MAST.z, r: 22, h: pad(MAST, MAST.x, MAST.z) },
    // Crypt mounds.
    { x: CRYPT_A.x, z: CRYPT_A.z, r: 20, h: pad(CRYPT_A, CRYPT_A.x, CRYPT_A.z) },
    { x: CRYPT_B.x, z: CRYPT_B.z, r: 20, h: pad(CRYPT_B, CRYPT_B.x, CRYPT_B.z) },
    { x: CRYPT_C.x, z: CRYPT_C.z, r: 20, h: pad(CRYPT_C, CRYPT_C.x, CRYPT_C.z) },
    // The pool the village stands in, then the two dry banks inside it. Order
    // matters: a later flat overrides an earlier one where they overlap.
    { x: VILLAGE.x, z: VILLAGE.z + 8, r: 44, h: -0.6 },
    { x: BANK_A.x, z: BANK_A.z, r: 12, h: 1.6 },
    { x: BANK_B.x, z: BANK_B.z, r: 9, h: 1.4 },
    // Causeway between the station and the northern crypt, for the armour.
    { x: 205, z: -180, r: 26, h: 3.2 },
  ],
  spawns: [
    // The mast and its guns.
    { type: "radar", x: MAST.x, z: MAST.z, heading: 0.4, tag: "mast" },
    { type: "aa", x: MAST.x + 20, z: MAST.z - 12 },
    { type: "aa", x: MAST.x - 18, z: MAST.z + 14 },
    ...ring("zombie", MAST.x, MAST.z, 12, 3),
    { type: "zombie", x: MAST.x + 6, z: MAST.z + 16, variant: 1 },
    { type: "tank", x: MAST.x, z: MAST.z - 22, heading: 1.2, waypoints: [[150, 148], [172, 170], [150, 192], [128, 170]] },

    // The station: the laboratory inside its walls, flak on the corners.
    { type: "hq", x: STATION.x, z: STATION.z, heading: Math.PI / 2, tag: "lab" },
    ...square(STATION.x, STATION.z, 22, 2),
    { type: "aa", x: STATION.x - 30, z: STATION.z - 26 },
    { type: "aa", x: STATION.x + 32, z: STATION.z - 24 },
    { type: "aa", x: STATION.x + 28, z: STATION.z + 30 },
    { type: "building", x: STATION.x - 12, z: STATION.z + 12, heading: 0.2, variant: 1 },
    { type: "fuelDepot", x: STATION.x + 12, z: STATION.z + 12 },
    ...ring("zombie", STATION.x, STATION.z, 16, 4, { variant: 1 }),
    // Armour on the causeway down to the northern crypt.
    { type: "tank", x: 200, z: -90, heading: 2.6, waypoints: [[200, -90], [250, -130], [230, -190], [195, -225], [175, -160]] },
    { type: "tank", x: 230, z: -190, heading: 0.4, waypoints: [[230, -190], [195, -225], [175, -160], [200, -90], [250, -130]] },

    // Crypt A: the closest to the village. Its dead are already in the water.
    { type: "crypt", x: CRYPT_A.x, z: CRYPT_A.z, heading: -Math.PI / 2, tag: "crypt", count: 5 },
    { type: "aa", x: CRYPT_A.x + 18, z: CRYPT_A.z - 16 },
    { type: "aa", x: CRYPT_A.x - 6, z: CRYPT_A.z + 24 },
    ...ring("zombie", CRYPT_A.x, CRYPT_A.z, 14, 5),
    { type: "zombie", x: CRYPT_A.x - 16, z: CRYPT_A.z + 4, variant: 1 },
    // Already in the pool under the village, wading toward the banks.
    ...ring("zombie", -138, 62, 10, 8),

    // Crypt B: north, under the station's guns.
    { type: "crypt", x: CRYPT_B.x, z: CRYPT_B.z, heading: 0.5, tag: "crypt", count: 5 },
    { type: "aa", x: CRYPT_B.x - 20, z: CRYPT_B.z - 10 },
    { type: "aa", x: CRYPT_B.x + 8, z: CRYPT_B.z + 24 },
    ...ring("zombie", CRYPT_B.x, CRYPT_B.z, 14, 5),
    { type: "zombie", x: CRYPT_B.x + 10, z: CRYPT_B.z - 18, variant: 1 },

    // Crypt C: south, near enough to the landing zone to matter on the way home.
    { type: "crypt", x: CRYPT_C.x, z: CRYPT_C.z, heading: Math.PI, tag: "crypt", count: 5 },
    { type: "aa", x: CRYPT_C.x + 22, z: CRYPT_C.z + 6 },
    { type: "aa", x: CRYPT_C.x - 16, z: CRYPT_C.z - 20 },
    ...ring("zombie", CRYPT_C.x, CRYPT_C.z, 14, 5),
    { type: "zombie", x: CRYPT_C.x - 4, z: CRYPT_C.z + 20, variant: 1 },

    // The survey party, on the two dry banks at the landward end of the village.
    { type: "pow", x: BANK_A.x - 4, z: BANK_A.z - 3 },
    { type: "pow", x: BANK_A.x + 4, z: BANK_A.z - 2 },
    { type: "pow", x: BANK_A.x, z: BANK_A.z + 3 },
    { type: "pow", x: BANK_A.x - 3, z: BANK_A.z + 4 },
    { type: "pow", x: BANK_B.x - 2, z: BANK_B.z - 2 },
    { type: "pow", x: BANK_B.x + 3, z: BANK_B.z + 2 },

    // Gunboats working the channel, waypoints on the centreline.
    { type: "gunboat", x: -10, z: -300, heading: 0.4, tag: "patrol", waypoints: [[-10, -300], [30, -210], [90, -120], [60, -20]] },
    { type: "gunboat", x: 0, z: 60, heading: 3.0, tag: "patrol", waypoints: [[0, 60], [-20, 160], [20, 260], [60, 340]] },
    { type: "gunboat", x: 60, z: -20, heading: 2.8, tag: "patrol", waypoints: [[60, -20], [0, 60], [-20, 160], [60, -20]] },

    // Supplies, all on dry ground.
    { type: "pickup", x: LANDING.x + 12, z: LANDING.z - 16, item: "fuel" },
    { type: "pickup", x: LANDING.x - 16, z: LANDING.z + 10, item: "ammo" },
    { type: "pickup", x: LANDING.x + 16, z: LANDING.z + 18, item: "armor" },
    { type: "pickup", x: BANK_A.x + 7, z: BANK_A.z + 4, item: "fuel" },
    { type: "pickup", x: CRYPT_A.x + 8, z: CRYPT_A.z - 10, item: "ammo" },
    { type: "pickup", x: CRYPT_A.x - 10, z: CRYPT_A.z - 8, item: "fuel" },
    { type: "pickup", x: MAST.x - 8, z: MAST.z - 14, item: "ammo" },
    { type: "pickup", x: MAST.x + 12, z: MAST.z + 8, item: "fuel" },
    { type: "pickup", x: STATION.x - 28, z: STATION.z + 14, item: "fuel" },
    { type: "pickup", x: STATION.x + 30, z: STATION.z + 8, item: "armor" },
    { type: "pickup", x: 205, z: -180, item: "fuel" },
    { type: "pickup", x: CRYPT_B.x - 10, z: CRYPT_B.z + 8, item: "ammo" },
    { type: "pickup", x: CRYPT_C.x + 10, z: CRYPT_C.z + 8, item: "fuel" },
    { type: "pickup", x: CRYPT_C.x - 8, z: CRYPT_C.z - 6, item: "armor" },
  ],
  objectives: [
    {
      id: "mast",
      kind: "destroyTag",
      tag: "mast",
      effect: "radarDown",
      text: "Destroy the radio mast",
      total: 1,
      doneMessage: "Mast down. Nothing they see leaves the marsh now.",
    },
    {
      id: "crypt",
      kind: "destroyTag",
      tag: "crypt",
      text: "Burn the three crypts",
      total: 3,
      doneMessage: "All three crypts are rubble. Whatever is still walking is all there will ever be.",
    },
    {
      id: "survivors",
      kind: "rescue",
      text: "Lift the six surveyors off the village",
      total: 6,
      doneMessage: "All six home. They will not be going back for their instruments.",
    },
    {
      id: "patrol",
      kind: "destroyTag",
      tag: "patrol",
      text: "Sink the three channel gunboats",
      total: 3,
      doneMessage: "The channel is quiet. Nothing moves on the water but the mist.",
    },
    {
      id: "lab",
      kind: "destroyTag",
      tag: "lab",
      text: "Destroy the laboratory",
      total: 1,
      doneMessage: "The station is burning. Sixty years too late, but burning.",
    },
    {
      id: "return",
      kind: "returnToLZ",
      text: "Return to the landing zone",
      total: 1,
      final: true,
      doneMessage: "Welcome home. Mission complete.",
    },
  ],
};
