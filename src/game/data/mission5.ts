import { ring, type MissionData } from "./mission";
import { atollTheme } from "../world/Theme";

/*
 * Operation Reef Knot. A chain of islands in open ocean, with the enemy's
 * network spread thin across them: a radar on the high peak, a fuel dump in a
 * lagoon, a submarine pen cut into a cliff, and patrol boats working the water
 * between. Three aircrew are down on a reef in the north.
 */

interface Island {
  x: number;
  z: number;
  r: number;
  h: number;
}

const KESTREL: Island = { x: -300, z: 280, r: 50, h: 8 };
const TAMARIND: Island = { x: 90, z: -190, r: 100, h: 24 };
const BLACKSAND: Island = { x: -120, z: -120, r: 55, h: 10 };
const BASTION: Island = { x: 250, z: 30, r: 60, h: 20 };
const MAHOGANY: Island = { x: -170, z: 120, r: 45, h: 7 };
const SANDCAY: Island = { x: 40, z: 240, r: 22, h: 3.5 };
const PILLAR: Island = { x: 320, z: -300, r: 18, h: 7 };
/** The reef the freighter went onto: too low for anything to grow on it. */
const SHOAL: Island = { x: 78, z: 256, r: 15, h: 1.3 };

const ISLANDS = [KESTREL, TAMARIND, BLACKSAND, BASTION, MAHOGANY, SANDCAY, PILLAR, SHOAL];

/**
 * Height for a level pad on an island. Islands are raised with `max()` after
 * the flats, modulated by noise up to 1.15, so a pad has to sit just proud of
 * the dome at its own distance from the peak or the dome eats it.
 */
function pad(isl: Island, x: number, z: number): number {
  const d = Math.hypot(x - isl.x, z - isl.z);
  const t = Math.min(1, Math.max(0, (d - isl.r * 0.2) / (isl.r * 0.8)));
  const k = Math.pow(1 - t * t * (3 - 2 * t), 0.85);
  // 1.15 is the top of the dome's noise range; the rest is margin.
  return isl.h * k * 1.2;
}

const PEN = { x: 232, z: 30 };
const DUMP = { x: -124, z: -118 };

export const mission5: MissionData = {
  id: "reefknot",
  name: "Operation Reef Knot",
  codename: "REEF KNOT",
  summary: "An island chain in open ocean. Blind the radar on the peak, burn the lagoon fuel dump, sink the patrol boats, break the submarine pen and lift three downed aircrew off a reef.",
  briefing: [
    "The enemy has spread a whole network across this island chain, because no single piece of it is worth a strike on its own. Together they close the sea lane for four hundred miles.",
    "Start with the radar on the peak of the big island in the south. While it turns, everything you do is watched and every boat out there knows where you are.",
    "Four patrol boats work the water between the islands and they hunt in the open, where you have nowhere to put the aircraft down. Their fuel and ammunition come from a dump in the lagoon on the black sand island, and the boats themselves shelter in a pen cut into the cliff on the east rock. Break all three.",
    "A transport went into the sea two nights ago and three of her crew made a reef in the north. They are waiting on the sand beside the wreck. Winch them up and bring them back with you.",
    "There is no friendly ground out here but the cay you launch from and the carrier standing off it. Fuel and ammunition are cached on the islands. Watch the gauge: the water is very wide.",
  ],
  seed: 2003,
  music: "jungle-advance",
  theme: atollTheme,
  terrain: {
    shape: "atoll",
    islands: ISLANDS.map((i) => ({ x: i.x, z: i.z, r: i.r, h: i.h })),
  },
  decor: [
    // Fishing village on stilts, running off Mahogany's lagoon shore.
    { kind: "village", x: -112, z: 170, heading: 0.85, count: 9, width: 44, length: 62 },
    // Submarine pen driven into the west face of Bastion Rock, mouth to the sea.
    { kind: "pen", x: 212, z: 30, heading: Math.PI / 2, length: 46, width: 30 },
    // Light on the outer rock, still burning.
    { kind: "lighthouse", x: PILLAR.x, z: PILLAR.z, heading: 0.4, length: 24 },
    // The freighter, broken on the reef north of the cay.
    { kind: "hulk", x: SHOAL.x, z: SHOAL.z, heading: 1.1, length: 54 },
  ],
  base: { x: KESTREL.x, z: KESTREL.z },
  lz: { x: KESTREL.x, z: KESTREL.z, r: 14 },
  flats: [
    // Landing cay, levelled right across so the pad and its tents sit true.
    { x: KESTREL.x, z: KESTREL.z, r: 34, h: pad(KESTREL, KESTREL.x, KESTREL.z) },
    // Radar summit.
    { x: TAMARIND.x, z: TAMARIND.z, r: 26, h: pad(TAMARIND, TAMARIND.x, TAMARIND.z) },
    // Lagoon shelf holding the fuel dump.
    { x: DUMP.x, z: DUMP.z, r: 32, h: pad(BLACKSAND, DUMP.x, DUMP.z) },
    // Ground above the submarine pen.
    { x: PEN.x, z: PEN.z, r: 24, h: pad(BASTION, PEN.x, PEN.z) },
    // Village island top.
    { x: MAHOGANY.x, z: MAHOGANY.z, r: 22, h: pad(MAHOGANY, MAHOGANY.x, MAHOGANY.z) },
    // Sand bar the aircrew are sitting on.
    { x: SANDCAY.x, z: SANDCAY.z, r: 14, h: pad(SANDCAY, SANDCAY.x, SANDCAY.z) },
    // Lighthouse rock.
    { x: PILLAR.x, z: PILLAR.z, r: 11, h: pad(PILLAR, PILLAR.x, PILLAR.z) },
  ],
  spawns: [
    // Friendly carrier standing off the landing cay, decorative.
    { type: "carrier", x: -355, z: 170, heading: 0.6 },

    // Tamarind: the radar peak and its garrison.
    { type: "radar", x: TAMARIND.x, z: TAMARIND.z, heading: 0.3, tag: "radar" },
    { type: "aa", x: 140, z: -160 },
    { type: "aa", x: 40, z: -215 },
    { type: "sam", x: 60, z: -130 },
    { type: "building", x: 122, z: -222, heading: 0.4, variant: 1 },
    ...ring("tower", TAMARIND.x, TAMARIND.z, 45, 2),
    ...ring("infantry", TAMARIND.x, TAMARIND.z, 24, 4),

    // Black Sand: the fuel and ammunition dump in the lagoon.
    { type: "fuelDepot", x: -138, z: -112, tag: "depot" },
    { type: "fuelDepot", x: -125, z: -120, tag: "depot" },
    { type: "fuelDepot", x: -100, z: -132, tag: "depot" },
    { type: "building", x: -150, z: -135, heading: -0.5, variant: 0 },
    { type: "building", x: -96, z: -100, heading: 0.8, variant: 0 },
    { type: "aa", x: -140, z: -90 },
    ...ring("infantry", BLACKSAND.x, BLACKSAND.z, 22, 3),

    // Bastion Rock: the submarine pen and the cliff above it.
    { type: "hq", x: PEN.x, z: PEN.z, heading: -Math.PI / 2, tag: "pen" },
    { type: "sam", x: 272, z: 62 },
    { type: "aa", x: 282, z: 8 },
    { type: "tower", x: 214, z: 62, heading: 0 },
    ...ring("infantry", BASTION.x, BASTION.z, 24, 4),

    // Mahogany: the fishing village and a few pickets.
    ...ring("building", MAHOGANY.x, MAHOGANY.z, 13, 3, { variant: 2 }),
    ...ring("infantry", MAHOGANY.x, MAHOGANY.z, 9, 3),
    { type: "jeep", x: -186, z: 106, heading: 1.2, waypoints: [[-186, 106], [-154, 108], [-158, 136], [-188, 132]] },

    // Sand Cay: the downed aircrew and the two men watching them.
    { type: "pow", x: 34, z: 237 },
    { type: "pow", x: 44, z: 243 },
    { type: "pow", x: 38, z: 247 },
    { type: "infantry", x: 50, z: 234 },
    { type: "infantry", x: 32, z: 246 },

    // Pillar Rock: the lighthouse and its gun.
    { type: "aa", x: 328, z: -292 },

    // Patrol boats, working the open water between the islands.
    { type: "gunboat", x: -240, z: 200, heading: 0.6, tag: "patrol", waypoints: [[-240, 200], [-150, 235], [-85, 175], [-120, 40], [-260, 70]] },
    { type: "gunboat", x: -40, z: -60, heading: 1.8, tag: "patrol", waypoints: [[-40, -60], [20, -70], [-10, -30], [-80, -40]] },
    { type: "gunboat", x: 160, z: -80, heading: 2.4, tag: "patrol", waypoints: [[160, -80], [260, -160], [350, -110], [330, -40]] },
    { type: "gunboat", x: 120, z: 180, heading: 3.0, tag: "patrol", waypoints: [[120, 180], [110, 300], [-40, 280], [10, 140]] },
    // Two more working close to the pen mouth, not part of the count.
    { type: "gunboat", x: 170, z: 75, heading: 2.8, waypoints: [[170, 75], [120, 20], [170, -45]] },
    { type: "gunboat", x: 145, z: 95, heading: 2.2, waypoints: [[145, 95], [95, 35], [140, -35]] },

    // Supplies. The map is nearly all water, so fuel outnumbers everything else.
    { type: "pickup", x: -286, z: 262, item: "fuel" },
    { type: "pickup", x: -314, z: 296, item: "ammo" },
    { type: "pickup", x: -282, z: 300, item: "armor" },
    { type: "pickup", x: -160, z: 132, item: "fuel" },
    { type: "pickup", x: -182, z: 134, item: "ammo" },
    { type: "pickup", x: -110, z: -140, item: "fuel" },
    { type: "pickup", x: -142, z: -138, item: "armor" },
    { type: "pickup", x: 66, z: -168, item: "fuel" },
    { type: "pickup", x: 112, z: -196, item: "ammo" },
    { type: "pickup", x: 74, z: -212, item: "fuel" },
    { type: "pickup", x: 246, z: 16, item: "fuel" },
    { type: "pickup", x: 258, z: 46, item: "ammo" },
    { type: "pickup", x: 226, z: 44, item: "armor" },
    { type: "pickup", x: 42, z: 233, item: "fuel" },
  ],
  objectives: [
    {
      id: "radar",
      kind: "destroyTag",
      tag: "radar",
      effect: "radarDown",
      text: "Destroy the radar on the peak",
      total: 1,
      doneMessage: "Radar down. The chain is yours to pick apart.",
    },
    {
      id: "patrol",
      kind: "destroyTag",
      tag: "patrol",
      text: "Sink the four patrol boats",
      total: 4,
      doneMessage: "All four patrol boats on the bottom. The water between the islands is quiet.",
    },
    {
      id: "depot",
      kind: "destroyTag",
      tag: "depot",
      text: "Burn the lagoon fuel dump",
      total: 3,
      doneMessage: "The dump is burning. Nothing out here gets refuelled now.",
    },
    {
      id: "pen",
      kind: "destroyTag",
      tag: "pen",
      text: "Destroy the submarine pen",
      total: 1,
      doneMessage: "The pen is broken open. Nothing shelters in that cliff again.",
    },
    {
      id: "crew",
      kind: "rescue",
      text: "Lift the three aircrew off the reef",
      total: 3,
      doneMessage: "All three aboard and home. That is the part that mattered.",
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
