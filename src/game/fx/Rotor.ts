import * as THREE from "three/webgpu";
import { atan, color, float, positionLocal, smoothstep, time } from "three/tsl";

/**
 * Translucent disc with slowly sweeping streaks that reads as a blurred
 * rotor at speed. Sits just below the physical blades.
 */
export function createRotorDisc(radius: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 48);
  const mat = new THREE.MeshBasicNodeMaterial();
  const p = positionLocal.xy;
  const r = p.length().div(radius);
  // Single-argument atan repeats every pi, which is fine for an 8-fold streak pattern.
  const angle = atan(p.y.div(p.x.add(1e-5)));
  const streak = angle.mul(8).sub(time.mul(20)).sin().mul(0.5).add(0.5);
  // Edges always low-to-high: WGSL smoothstep is undefined with reversed edges.
  const radial = smoothstep(0.1, 0.4, r).mul(smoothstep(0.85, 1.0, r).oneMinus());
  mat.colorNode = color(0x26281f);
  mat.opacityNode = radial.mul(float(0.26).add(streak.mul(0.16)));
  mat.transparent = true;
  mat.depthWrite = false;
  mat.side = THREE.DoubleSide;
  const disc = new THREE.Mesh(geo, mat);
  disc.rotation.x = -Math.PI / 2;
  disc.renderOrder = 5;
  return disc;
}

export interface RotorSplit {
  /** Pivot at the hub; rotate its Y to spin the blades. */
  pivot: THREE.Group;
  radius: number;
}

const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();

/**
 * Pulls rotor-blade triangles out of a single-mesh helicopter model so they
 * can spin. Blades are found as the thin band of triangles at the very top of
 * the model that lie well away from the hub axis. Returns null when nothing
 * that looks like a rotor is found.
 */
export function splitRotorFromModel(asset: THREE.Object3D): RotorSplit | null {
  asset.updateMatrixWorld(true);
  let best: { mesh: THREE.Mesh; count: number } | null = null;
  asset.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry.attributes.position) {
      const c = m.geometry.attributes.position.count;
      if (!best || c > best.count) best = { mesh: m, count: c };
    }
  });
  if (!best) return null;
  const mesh = (best as { mesh: THREE.Mesh }).mesh;
  const geo = mesh.geometry;
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const n = posAttr.count;

  // Vertices in the asset's local space (the pivot is added to the asset).
  const toAsset = new THREE.Matrix4().copy(asset.matrixWorld).invert().multiply(mesh.matrixWorld);
  const pts = new Float32Array(n * 3);
  let top = -Infinity;
  let bottom = Infinity;
  let maxR = 0;
  for (let i = 0; i < n; i++) {
    tmpV.fromBufferAttribute(posAttr, i).applyMatrix4(toAsset);
    pts[i * 3] = tmpV.x;
    pts[i * 3 + 1] = tmpV.y;
    pts[i * 3 + 2] = tmpV.z;
    if (tmpV.y > top) top = tmpV.y;
    if (tmpV.y < bottom) bottom = tmpV.y;
    const r = Math.hypot(tmpV.x, tmpV.z);
    if (r > maxR) maxR = r;
  }
  const height = top - bottom;
  const bandY = top - height * 0.18;

  // Hub: average of the far-out vertices in the top band (blade tips).
  let hx = 0;
  let hz = 0;
  let hy = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const y = pts[i * 3 + 1];
    if (y < bandY) continue;
    const r = Math.hypot(pts[i * 3], pts[i * 3 + 2]);
    if (r < maxR * 0.35) continue;
    hx += pts[i * 3];
    hz += pts[i * 3 + 2];
    hy += y;
    count++;
  }
  if (count < 6) return null;
  hx /= count;
  hz /= count;
  hy /= count;

  const index = geo.index ? Array.from(geo.index.array) : Array.from({ length: n }, (_, i) => i);
  const hubExclude = maxR * 0.12;
  const keyOf = (i: number) => `${pts[i * 3].toFixed(3)},${pts[i * 3 + 1].toFixed(3)},${pts[i * 3 + 2].toFixed(3)}`;

  // Candidates: top-band triangles away from the hub. Seeds are the flat
  // ones (blade tops and bottoms); the rest join by touching a seed, so blade
  // side walls come along while an unconnected tail fin top does not.
  interface Tri {
    a: number;
    b: number;
    c: number;
    r: number;
    flat: boolean;
  }
  const candidates: Tri[] = [];
  const candidateSet = new Set<number>();
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t];
    const b = index[t + 1];
    const c = index[t + 2];
    const inBand = pts[a * 3 + 1] >= bandY && pts[b * 3 + 1] >= bandY && pts[c * 3 + 1] >= bandY;
    if (!inBand) continue;
    const cx = (pts[a * 3] + pts[b * 3] + pts[c * 3]) / 3 - hx;
    const cz = (pts[a * 3 + 2] + pts[b * 3 + 2] + pts[c * 3 + 2]) / 3 - hz;
    const r = Math.hypot(cx, cz);
    if (r <= hubExclude) continue;
    const ux = pts[b * 3] - pts[a * 3];
    const uy = pts[b * 3 + 1] - pts[a * 3 + 1];
    const uz = pts[b * 3 + 2] - pts[a * 3 + 2];
    const vx = pts[c * 3] - pts[a * 3];
    const vy = pts[c * 3 + 1] - pts[a * 3 + 1];
    const vz = pts[c * 3 + 2] - pts[a * 3 + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    candidates.push({ a, b, c, r, flat: Math.abs(ny / len) > 0.6 });
    candidateSet.add(t);
  }

  const rotorKeys = new Set<string>();
  const inRotor = new Set<Tri>();
  for (const tri of candidates) {
    if (!tri.flat) continue;
    inRotor.add(tri);
    rotorKeys.add(keyOf(tri.a));
    rotorKeys.add(keyOf(tri.b));
    rotorKeys.add(keyOf(tri.c));
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const tri of candidates) {
      if (inRotor.has(tri)) continue;
      const ka = keyOf(tri.a);
      const kb = keyOf(tri.b);
      const kc = keyOf(tri.c);
      if (rotorKeys.has(ka) || rotorKeys.has(kb) || rotorKeys.has(kc)) {
        inRotor.add(tri);
        rotorKeys.add(ka);
        rotorKeys.add(kb);
        rotorKeys.add(kc);
        grew = true;
      }
    }
  }

  const bodyIdx: number[] = [];
  const rotorIdx: number[] = [];
  let bladeMaxR = 0;
  let ci = 0;
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t];
    const b = index[t + 1];
    const c = index[t + 2];
    if (candidateSet.has(t)) {
      const tri = candidates[ci++];
      if (inRotor.has(tri)) {
        rotorIdx.push(a, b, c);
        if (tri.r > bladeMaxR) bladeMaxR = tri.r;
        continue;
      }
    }
    bodyIdx.push(a, b, c);
  }
  if (rotorIdx.length < 12) return null;

  // Body keeps the original attributes with the blade triangles removed.
  const bodyGeo = geo.clone();
  bodyGeo.setIndex(bodyIdx);
  mesh.geometry = bodyGeo;

  // Blades become their own mesh under a pivot at the hub, keeping the
  // original node transform so they land exactly where they were.
  const rotorGeo = geo.clone();
  rotorGeo.setIndex(rotorIdx);
  const bladeMat = (mesh.material as THREE.Material).clone();
  bladeMat.transparent = true;
  bladeMat.opacity = 0.85;
  bladeMat.depthWrite = false;
  const blades = new THREE.Mesh(rotorGeo, bladeMat);
  blades.castShadow = true;
  blades.renderOrder = 6;
  const pivot = new THREE.Group();
  pivot.position.set(hx, hy, hz);
  // Low-poly models tend to have stubby rotors; widen the sweep so it reads from the air.
  pivot.scale.set(1.4, 1, 1.4);
  tmpM.makeTranslation(-hx, -hy, -hz).multiply(toAsset);
  tmpM.decompose(blades.position, blades.quaternion, blades.scale);
  pivot.add(blades);
  const disc = createRotorDisc(bladeMaxR * 0.95);
  disc.position.y = -0.15;
  pivot.add(disc);
  asset.add(pivot);
  return { pivot, radius: bladeMaxR };
}
