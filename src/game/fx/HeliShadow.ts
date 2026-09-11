import * as THREE from "three/webgpu";

const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpInv = new THREE.Matrix4();

/**
 * The aircraft's shadow as one soft decal baked from its own geometry. Every
 * triangle of the airframe is projected straight down onto the model's local
 * XZ plane and filled into a canvas, the result is blurred so the edges go
 * soft, and a faint disc stands in for the spinning main rotor (real blades
 * would freeze into a cross). The decal is placed each frame along the sun's
 * rays, so it lands where a shadow would, just without the sun's shear.
 *
 * `size` is the decal width in metres. The nose (model +Z) points along the
 * plane's local +Y and model +X maps to plane -X, matching a plane rotated
 * -90 degrees about X and then `heading + PI` about Y.
 */
export function bakeHeliShadow(body: THREE.Object3D, rotors: THREE.Object3D[], size: number): THREE.Mesh {
  const px = 512;
  const scale = px / size;
  body.updateWorldMatrix(true, true);
  tmpInv.copy(body.matrixWorld).invert();

  // Sharp silhouette first, blurred onto the final canvas afterwards: the
  // canvas blur filter only applies to drawing operations, not to pixels
  // already on the surface. Everything is painted white on opaque black:
  // an alpha map reads the green channel, and on a transparent canvas that
  // channel is full wherever coverage is nonzero, which turns any blur into
  // a hard-edged blob.
  const sharp = document.createElement("canvas");
  sharp.width = px;
  sharp.height = px;
  const sc = sharp.getContext("2d")!;
  sc.fillStyle = "#000";
  sc.fillRect(0, 0, px, px);
  sc.fillStyle = "#fff";

  const inRotor = new Set<THREE.Object3D>();
  for (const r of rotors) r.traverse((o) => inRotor.add(o));

  const toCanvas = (v: THREE.Vector3): [number, number] => [px / 2 - v.x * scale, px / 2 - v.z * scale];

  body.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || inRotor.has(o) || !mesh.visible) return;
    const geo = mesh.geometry;
    const pos = geo.getAttribute("position");
    if (!pos) return;
    tmpM.multiplyMatrices(tmpInv, mesh.matrixWorld);
    const index = geo.index;
    const triCount = index ? index.count / 3 : pos.count / 3;
    const pts: [number, number][] = [];
    for (let i = 0; i < pos.count; i++) {
      tmpV.fromBufferAttribute(pos, i).applyMatrix4(tmpM);
      pts.push(toCanvas(tmpV));
    }
    sc.beginPath();
    for (let t = 0; t < triCount; t++) {
      const a = index ? index.getX(t * 3) : t * 3;
      const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      const pa = pts[a];
      let pb = pts[b];
      let pc = pts[c];
      // One winding for every triangle so the nonzero fill rule never cancels
      // overlapping faces out into holes.
      const area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1]);
      if (area < 0) [pb, pc] = [pc, pb];
      sc.moveTo(pa[0], pa[1]);
      sc.lineTo(pb[0], pb[1]);
      sc.lineTo(pc[0], pc[1]);
      sc.closePath();
    }
    sc.fill("nonzero");
  });

  // Main rotor: a translucent disc the size of the blade sweep, centred on
  // the hub. Blades themselves were skipped above.
  for (const r of rotors) {
    const box = new THREE.Box3();
    r.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry.getAttribute("position")) return;
      tmpM.multiplyMatrices(tmpInv, mesh.matrixWorld);
      const p = mesh.geometry.getAttribute("position");
      for (let i = 0; i < p.count; i++) box.expandByPoint(tmpV.fromBufferAttribute(p, i).applyMatrix4(tmpM));
    });
    if (box.isEmpty()) continue;
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    const [u, v] = toCanvas(tmpV.set(cx, 0, cz));
    const rp = radius * scale;
    const grad = sc.createRadialGradient(u, v, 0, u, v, rp);
    grad.addColorStop(0, "rgba(255,255,255,0.3)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.22)");
    grad.addColorStop(0.88, "rgba(255,255,255,0.18)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    sc.fillStyle = grad;
    // Brighten only: the disc must not dim the fuselage beneath it.
    sc.globalCompositeOperation = "lighten";
    sc.beginPath();
    sc.arc(u, v, rp, 0, Math.PI * 2);
    sc.fill();
  }

  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, px, px);
  // Two passes: a tight blur keeps the outline readable, a wide faint one
  // adds the penumbra. Lighten so the second pass never darkens the first.
  ctx.filter = "blur(4px)";
  ctx.drawImage(sharp, 0, 0);
  ctx.globalCompositeOperation = "lighten";
  ctx.filter = "blur(14px)";
  ctx.globalAlpha = 0.5;
  ctx.drawImage(sharp, 0, 0);

  const alpha = new THREE.CanvasTexture(canvas);
  alpha.colorSpace = THREE.NoColorSpace;
  alpha.anisotropy = 4;
  const mat = new THREE.MeshBasicNodeMaterial({ color: 0x120f0a, transparent: true, opacity: 0.6, depthWrite: false });
  mat.alphaMap = alpha;
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  decal.renderOrder = 3;
  decal.castShadow = false;
  decal.receiveShadow = false;
  decal.frustumCulled = false;
  decal.name = "heli-shadow";
  return decal;
}
