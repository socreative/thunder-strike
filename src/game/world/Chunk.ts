import * as THREE from "three/webgpu";

/**
 * Split a square grid geometry into a lattice of smaller ones that share its
 * vertices exactly.
 *
 * The terrain and the sea are each a single plane of a few hundred thousand
 * triangles covering the whole map, and a single mesh is culled all or
 * nothing, so every triangle is submitted however little of it is on screen.
 * Cutting them into tiles lets the frustum reject most of the map.
 *
 * The split copies vertices out of the finished geometry rather than rebuilding
 * them, so normals computed across the whole plane are carried over and the
 * seams between tiles cannot crack.
 *
 * `segments` must divide by `tiles`.
 */
export function splitGrid(geo: THREE.BufferGeometry, segments: number, tiles: number, padRadius = 0): THREE.BufferGeometry[] {
  const per = segments / tiles;
  if (!Number.isInteger(per)) throw new Error(`splitGrid: ${segments} segments do not divide into ${tiles} tiles`);
  const src = geo.attributes as Record<string, THREE.BufferAttribute>;
  const row = segments + 1;
  const out: THREE.BufferGeometry[] = [];
  // One quad strip of indices, shared by every tile: the layout is identical.
  const index: number[] = [];
  for (let z = 0; z < per; z++) {
    for (let x = 0; x < per; x++) {
      const a = z * (per + 1) + x;
      const b = a + 1;
      const c = a + (per + 1);
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const indexAttr = new THREE.Uint32BufferAttribute(index, 1);

  for (let tz = 0; tz < tiles; tz++) {
    for (let tx = 0; tx < tiles; tx++) {
      const g = new THREE.BufferGeometry();
      for (const name of Object.keys(src)) {
        const a = src[name];
        const size = a.itemSize;
        const dst = new Float32Array((per + 1) * (per + 1) * size);
        let w = 0;
        for (let z = 0; z <= per; z++) {
          const srcRow = (tz * per + z) * row + tx * per;
          for (let x = 0; x <= per; x++) {
            const s = (srcRow + x) * size;
            for (let c = 0; c < size; c++) dst[w++] = a.array[s + c];
          }
        }
        g.setAttribute(name, new THREE.BufferAttribute(dst, size));
      }
      g.setIndex(indexAttr);
      g.computeBoundingSphere();
      // The sea displaces its vertices after culling has already decided, so
      // its tiles need a little slack or crests pop in at the frustum edge.
      if (padRadius && g.boundingSphere) g.boundingSphere.radius += padRadius;
      out.push(g);
    }
  }
  return out;
}
