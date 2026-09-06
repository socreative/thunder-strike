import * as THREE from "three/webgpu";
import { Build, PALETTE as P } from "./Detail";

const HULL = 0x5d646b;
const HULL_DARK = 0x464d54;
const BOOT = 0x3a2320;
const DECK = 0x4e5257;
const DECK_LIGHT = 0x5e6267;
const MARK = 0xe8e3d2;
const YELLOW = 0xd9b448;
const SUPER = 0x6b7278;

/** Length overall and the deck's top surface. */
const LOA = 118;
const DECK_Y = 6.1;
/** The landing area is canted to port, as on a real carrier. */
const ANGLE = -0.17;

interface Station {
  z: number;
  /** Half beam at the keel and at the hull's upper edge. */
  hb: number;
  ht: number;
}

const KEEL = -7;
const SHEER = 5.2;

const STATIONS: Station[] = [
  { z: -59, hb: 7.5, ht: 11.8 },
  { z: -50, hb: 9.6, ht: 13.0 },
  { z: -32, hb: 11.0, ht: 13.5 },
  { z: -10, hb: 11.2, ht: 13.6 },
  { z: 12, hb: 10.8, ht: 13.4 },
  { z: 30, hb: 9.6, ht: 12.4 },
  { z: 43, hb: 7.2, ht: 10.2 },
  { z: 51, hb: 4.4, ht: 6.8 },
  { z: 57, hb: 1.8, ht: 3.0 },
  { z: 59, hb: 0.5, ht: 1.0 },
];

/**
 * Loft a hull from cross sections. Flat shaded, this gives the faceted plating
 * look of the key art while still reading as a real ship rather than a box.
 */
function loftHull(st: Station[], keel: number, sheer: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    tri(a, b, c);
    tri(a, c, d);
  };
  for (let i = 0; i < st.length - 1; i++) {
    const s0 = st[i];
    const s1 = st[i + 1];
    // Starboard shell, port shell, then the bottom.
    quad([s0.ht, sheer, s0.z], [s0.hb, keel, s0.z], [s1.hb, keel, s1.z], [s1.ht, sheer, s1.z]);
    quad([-s1.ht, sheer, s1.z], [-s1.hb, keel, s1.z], [-s0.hb, keel, s0.z], [-s0.ht, sheer, s0.z]);
    quad([-s0.hb, keel, s0.z], [s0.hb, keel, s0.z], [s1.hb, keel, s1.z], [-s1.hb, keel, s1.z]);
  }
  // Transom across the stern.
  const a = st[0];
  quad([-a.ht, sheer, a.z], [a.ht, sheer, a.z], [a.hb, keel, a.z], [-a.hb, keel, a.z]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  // Merging needs a consistent attribute set across every part.
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.computeVertexNormals();
  return geo;
}

/** Half beam of the hull at a given station, for placing sponsons and catwalks. */
function beamAt(z: number): number {
  for (let i = 0; i < STATIONS.length - 1; i++) {
    const a = STATIONS[i];
    const b = STATIONS[i + 1];
    if (z >= a.z && z <= b.z) {
      const t = (z - a.z) / (b.z - a.z);
      return a.ht + (b.ht - a.ht) * t;
    }
  }
  return STATIONS[STATIONS.length - 1].ht;
}

/**
 * Flat plate from a polygon, for wings and tails. Horizontal plates take
 * [x, z] points and thicken in Y; vertical ones take [chord, height] and
 * thicken in X, with `lean` canting the top outboard.
 */
function plateGeo(pts: [number, number][], thick: number, horizontal: boolean, off: [number, number, number] = [0, 0, 0], lean = 0): THREE.BufferGeometry {
  const h = thick / 2;
  const out: number[] = [];
  const v = (p: [number, number], side: number): number[] => (horizontal ? [p[0], side * h, p[1]] : [side * h + p[1] * lean, p[1], p[0]]);
  const tri = (a: number[], b2: number[], c: number[]) => out.push(...a, ...b2, ...c);
  const n = pts.length;
  for (let i = 1; i < n - 1; i++) {
    tri(v(pts[0], 1), v(pts[i], 1), v(pts[i + 1], 1));
    tri(v(pts[0], -1), v(pts[i + 1], -1), v(pts[i], -1));
  }
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % n];
    tri(v(a, 1), v(a, -1), v(c, -1));
    tri(v(a, 1), v(c, -1), v(c, 1));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((out.length / 3) * 2), 2));
  geo.translate(off[0], off[1], off[2]);
  geo.computeVertexNormals();
  return geo;
}

const JET = 0x8d9399;
const JET_DARK = 0x6d747a;

/** A parked strike fighter: swept tapered wings, canted twin fins, nose to +Z. */
function parkedJet(b: Build, jx: number, jz: number, ry: number): void {
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const mat = { flat: true, metalness: 0.3, roughness: 0.55, side: THREE.DoubleSide };
  // Local offset to world. "YXZ" turns the part after laying it down, which the
  // default order does not: it applies the heading first, so a lying cylinder
  // would ignore it entirely.
  const at = (lx: number, ly: number, lz: number, extra: Record<string, unknown> = {}) => ({
    x: jx + lx * cos + lz * sin,
    y: DECK_Y + ly,
    z: jz - lx * sin + lz * cos,
    ry,
    order: "YXZ" as THREE.EulerOrder,
    mat,
    ...extra,
  });
  // Plate geometry already carries its offsets, so it only needs the heading.
  const hull = (y: number) => ({ x: jx, y: DECK_Y + y, z: jz, ry, mat });

  // Fuselage, radome nose, tail cone and canopy.
  b.cyl(0.46, 0.5, 5.0, JET, at(0, 1.0, -0.4, { rx: Math.PI / 2, seg: 10 }));
  b.cone(0.46, 1.9, JET, at(0, 1.0, 3.0, { rx: Math.PI / 2, seg: 10 }));
  b.cyl(0.3, 0.46, 1.1, JET_DARK, at(0, 1.0, -3.15, { rx: Math.PI / 2, seg: 10 }));
  b.sphere(0.42, 0x243038, at(0, 1.3, 1.3, { seg: 8, s: [0.7, 0.5, 1.5], mat: { roughness: 0.2, metalness: 0.4 } }));
  for (const sx of [-1, 1]) b.box(0.4, 0.5, 2.1, JET_DARK, at(sx * 0.6, 0.85, 0.4));

  for (const sx of [-1, 1]) {
    // Swept tapered wing: root chord about three times the tip.
    b.add(
      plateGeo(
        [
          [sx * 0.5, 0.55],
          [sx * 2.85, -1.35],
          [sx * 3.0, -2.05],
          [sx * 0.5, -2.35],
        ],
        0.14,
        true,
      ),
      JET,
      hull(0.95),
    );
    // Leading edge extension blending the wing root into the fuselage.
    b.add(
      plateGeo(
        [
          [sx * 0.42, 2.0],
          [sx * 0.78, 0.55],
          [sx * 0.42, 0.55],
        ],
        0.1,
        true,
      ),
      JET,
      hull(1.06),
    );
    // All-moving tailplane.
    b.add(
      plateGeo(
        [
          [sx * 0.45, -2.65],
          [sx * 1.55, -3.1],
          [sx * 1.55, -3.55],
          [sx * 0.45, -3.5],
        ],
        0.11,
        true,
      ),
      JET,
      hull(0.95),
    );
    // Canted twin fin; the lean is baked into the geometry to keep it clear of
    // the heading rotation.
    b.add(
      plateGeo(
        [
          [-1.85, 0],
          [-2.3, 1.5],
          [-2.8, 1.5],
          [-3.1, 0],
        ],
        0.1,
        false,
        [sx * 0.5, 0, 0],
        sx * 0.32,
      ),
      JET,
      hull(1.2),
    );
    // Exhaust nozzle and main gear.
    b.cyl(0.26, 0.3, 0.5, 0x3a3f44, at(sx * 0.28, 1.0, -3.7, { rx: Math.PI / 2, seg: 8 }));
    b.cyl(0.05, 0.05, 0.7, JET_DARK, at(sx * 0.85, 0.62, -0.5));
    b.cyl(0.2, 0.2, 0.16, 0x1c1f22, at(sx * 0.85, 0.2, -0.5, { rz: Math.PI / 2, seg: 8 }));
  }
  // Nose gear.
  b.cyl(0.05, 0.05, 0.7, JET_DARK, at(0, 0.62, 2.3));
  b.cyl(0.18, 0.18, 0.14, 0x1c1f22, at(0, 0.2, 2.3, { rz: Math.PI / 2, seg: 8 }));
}

/**
 * Nuclear carrier: lofted hull, canted flight deck with markings, island with
 * bridge, funnels and radar, catwalks, sponsons and a few aircraft for scale.
 */
export function createCarrier(): { group: THREE.Group; spinner: THREE.Object3D } {
  const b = new Build();

  // Hull, waterline boot topping and bilge keels.
  b.add(loftHull(STATIONS, KEEL, SHEER), HULL, { mat: { roughness: 0.72, metalness: 0.25, flat: true, side: THREE.DoubleSide } });
  const boot = STATIONS.map((s) => ({ z: s.z, hb: s.hb * 0.999, ht: s.hb + (s.ht - s.hb) * 0.24 }));
  b.add(loftHull(boot, KEEL + 0.4, 0.3), BOOT, { mat: { roughness: 0.85, flat: true, side: THREE.DoubleSide } });
  for (const s of [-1, 1]) b.box(0.5, 0.5, 60, HULL_DARK, { x: s * 9.5, y: -5.2, z: -8, rz: s * 0.5 });

  // Gallery deck band under the overhang, then the flight deck itself.
  b.box(26, 1.2, 104, HULL_DARK, { y: 5.5, z: -3 });
  // Main deck, offset to starboard; the angled landing area runs off to port.
  b.box(28, 0.75, LOA, DECK, { x: 2.4, y: DECK_Y - 0.37, z: 0 });
  b.box(19, 0.75, 74, DECK, { x: -6.5, y: DECK_Y - 0.37, z: -12, ry: ANGLE });
  // Bow rounds off rather than ending square.
  b.box(19, 0.75, 6, DECK, { x: 2.0, y: DECK_Y - 0.37, z: 60, s: [0.86, 1, 1] });
  // Deck edge coaming all round.
  for (const s of [-1, 1]) b.box(0.5, 0.5, LOA - 6, DECK_LIGHT, { x: 2.4 + s * 14, y: DECK_Y + 0.1, z: -1 });

  /* Deck markings, laid a hair above the surface. */
  const my = DECK_Y + 0.04;
  // Angled landing area: centreline dashes plus its edge stripes.
  for (let i = 0; i < 16; i++) {
    const t = -46 + i * 5.4;
    b.box(0.7, 0.06, 2.8, MARK, { x: -6.5 + Math.sin(ANGLE) * -t, y: my, z: -12 + Math.cos(ANGLE) * t, ry: ANGLE });
  }
  for (const s of [-1, 1]) {
    b.box(0.55, 0.06, 74, MARK, { x: -6.5 + s * 8.2 * Math.cos(ANGLE), y: my, z: -12 - s * 8.2 * Math.sin(ANGLE), ry: ANGLE });
  }
  // Touchdown target and arrestor wires across the landing area.
  b.box(11, 0.06, 1.0, MARK, { x: -3.2, y: my, z: -26, ry: ANGLE });
  for (let i = 0; i < 4; i++) {
    b.box(15, 0.05, 0.28, 0x22262a, { x: -4.6, y: my, z: -34 + i * 5.5, ry: ANGLE });
  }
  // Bow catapult tracks and their blast deflectors.
  for (const cx of [-2.2, 6.6]) {
    b.box(0.85, 0.06, 52, 0x24282c, { x: cx, y: my, z: 28 });
    b.box(0.35, 0.06, 52, MARK, { x: cx, y: my + 0.01, z: 28 });
    b.box(5.5, 0.9, 0.5, 0x6a6f5a, { x: cx, y: DECK_Y + 0.45, z: 2, rx: -0.5 });
  }
  // Lift outlines, deck edge dashes and the landing spot number.
  for (const [lx, lz, lw, ll] of [
    [16.0, 18, 9, 14],
    [16.0, -22, 9, 14],
    [-13.5, 30, 8, 13],
  ] as [number, number, number, number][]) {
    b.box(lw, 0.06, 0.4, YELLOW, { x: lx, y: my, z: lz + ll / 2 });
    b.box(lw, 0.06, 0.4, YELLOW, { x: lx, y: my, z: lz - ll / 2 });
    b.box(0.4, 0.06, ll, YELLOW, { x: lx + lw / 2, y: my, z: lz });
    b.box(0.4, 0.06, ll, YELLOW, { x: lx - lw / 2, y: my, z: lz });
  }

  /* Catwalks and safety netting hung outboard, all round the deck edge. */
  for (const s of [-1, 1]) {
    for (let z = -52; z <= 52; z += 8) {
      const half = Math.min(beamAt(z) + 1.6, 15.5);
      b.box(2.0, 0.16, 7.2, DECK_LIGHT, { x: s * half + 2.4 * (s > 0 ? 1 : -1) * 0, y: DECK_Y - 0.9, z });
      b.railing(7.0, 0.85, P.metal, { x: s * (half + 0.9), y: DECK_Y - 0.82, z, ry: Math.PI / 2 });
    }
  }
  // Sponsons carrying close-in weapons at the quarters.
  for (const [sx, sz] of [
    [15.5, 44],
    [15.5, -44],
    [-15.0, 40],
    [-15.0, -40],
  ] as [number, number][]) {
    b.box(5.0, 1.0, 6.0, HULL_DARK, { x: sx, y: DECK_Y - 1.3, z: sz });
    b.cyl(1.0, 1.2, 1.0, SUPER, { x: sx, y: DECK_Y - 0.4, z: sz, seg: 10 });
    b.cyl(0.75, 0.85, 1.4, 0xd8d4c6, { x: sx, y: DECK_Y + 0.6, z: sz, seg: 10 });
    b.cyl(0.32, 0.32, 1.6, 0x2c3036, { x: sx, y: DECK_Y + 1.1, z: sz + 0.7, rx: -0.7, seg: 8 });
  }

  /* Island, on the starboard side. */
  const ix = 11.6;
  const iz = -8;
  b.box(7.0, 3.4, 22, SUPER, { x: ix, y: DECK_Y + 1.7, z: iz });
  b.box(6.4, 3.0, 16, SUPER, { x: ix, y: DECK_Y + 4.9, z: iz - 1 });
  // Bridge: window band wrapping the front and sides.
  b.box(6.6, 1.5, 9.4, 0x1b2429, { x: ix, y: DECK_Y + 7.3, z: iz + 1.4, mat: { roughness: 0.2, metalness: 0.4 } });
  b.box(6.8, 0.35, 9.8, SUPER, { x: ix, y: DECK_Y + 8.2, z: iz + 1.4 });
  b.box(5.6, 2.4, 7.0, SUPER, { x: ix, y: DECK_Y + 9.6, z: iz + 0.5 });
  b.box(4.6, 1.2, 5.2, 0x1b2429, { x: ix, y: DECK_Y + 11.2, z: iz + 0.5, mat: { roughness: 0.2, metalness: 0.4 } });
  b.box(5.0, 0.3, 5.6, SUPER, { x: ix, y: DECK_Y + 11.9, z: iz + 0.5 });
  // Bridge wings.
  for (const s of [-1, 1]) {
    b.box(2.0, 0.22, 3.0, DECK_LIGHT, { x: ix + s * 4.2, y: DECK_Y + 6.6, z: iz + 3.0 });
    b.railing(2.8, 0.8, P.metal, { x: ix + s * 4.2, y: DECK_Y + 6.7, z: iz + 3.0, ry: Math.PI / 2 });
  }
  // Twin uptakes venting aft.
  for (const s of [-1, 1]) {
    b.box(2.2, 4.2, 3.0, 0x555b60, { x: ix + s * 1.6, y: DECK_Y + 7.2, z: iz - 6.4 });
    b.cyl(0.85, 0.95, 1.0, 0x24282c, { x: ix + s * 1.6, y: DECK_Y + 9.5, z: iz - 6.4, seg: 10 });
  }
  // Flat panel air search arrays on the island faces.
  for (const [px, pz, ry] of [
    [ix + 3.6, iz + 2.0, 0.35],
    [ix - 3.6, iz + 2.0, -0.35],
    [ix, iz - 3.4, Math.PI],
  ] as [number, number, number][]) {
    b.box(3.4, 3.0, 0.35, 0xb9beb6, { x: px, y: DECK_Y + 5.4, z: pz, ry, rx: -0.18, mat: { roughness: 0.5 } });
  }
  // Main mast with yardarms and whip antennas.
  b.latticeMast(9.5, 1.5, 0xa5aaa2, { x: ix, y: DECK_Y + 12.0, z: iz - 1.5 });
  b.box(9.0, 0.2, 0.2, 0xa5aaa2, { x: ix, y: DECK_Y + 18.0, z: iz - 1.5 });
  b.box(6.0, 0.2, 0.2, 0xa5aaa2, { x: ix, y: DECK_Y + 20.0, z: iz - 1.5 });
  for (const s of [-1, 1]) {
    b.cyl(0.09, 0.09, 4.0, 0xa5aaa2, { x: ix + s * 3.2, y: DECK_Y + 15.5, z: iz - 5.0, rz: s * 0.25, seg: 4 });
  }
  b.cyl(0.12, 0.12, 5.0, 0xa5aaa2, { x: ix, y: DECK_Y + 23.5, z: iz - 1.5, seg: 5 });
  // Navigation lights.
  b.sphere(0.3, 0xff5a3c, { x: ix - 3.6, y: DECK_Y + 7.0, z: iz + 4.6, seg: 6, mat: { emissive: 0x662211 } });
  b.sphere(0.3, 0x6ad06a, { x: ix + 3.6, y: DECK_Y + 7.0, z: iz + 4.6, seg: 6, mat: { emissive: 0x116622 } });

  // Aircraft parked clear of the landing area.
  parkedJet(b, 14.5, 30, 0.5);
  parkedJet(b, 15.5, 12, 0.5);
  parkedJet(b, -13.0, 44, -0.4);
  parkedJet(b, 13.0, -34, 2.5);

  const group = b.finish();
  group.name = "carrier";

  // Rotating air search radar above the island.
  const r = new Build();
  r.cyl(0.5, 0.6, 0.5, 0x8f948c, { y: 0.25, seg: 10 });
  r.box(6.4, 1.5, 0.3, 0xd8d4c6, { y: 1.2, rx: -0.16, mat: { roughness: 0.5 } });
  r.box(6.4, 0.22, 0.7, 0x8f948c, { y: 0.42 });
  const spinner = r.finish();
  spinner.position.set(ix, DECK_Y + 21.0, iz - 1.5);
  spinner.name = "carrier-radar";
  group.add(spinner);

  return { group, spinner };
}
