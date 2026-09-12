import * as THREE from "three/webgpu";

/*
 * Coastal travel-time field, solved once from the seabed. The FFT stays the
 * wave source; its phase coordinates follow this finite-depth travel-time
 * field so crests slow over shallows and swing parallel to the shore.
 * Ported from Techartist's ocean-simulation (MIT), generalised to any swell
 * direction and to a caller-supplied seabed sampler.
 */

export interface CoastalField {
  /** RGBA: phase lead in metres, local travel direction xz, exposure 0..1. */
  texture: THREE.DataTexture;
  data: Float32Array;
  resolution: number;
  direction: [number, number];
  /** Deep-water phase speed of the peak wavelength. */
  c0: number;
}

export interface CoastalOptions {
  /** Seabed height at a world position; negative is under water. */
  bedAt: (x: number, z: number) => number;
  /** Side of the square map in metres, centred on the origin. */
  extent: number;
  /** Grid resolution of the solve. */
  resolution: number;
  /** Unit direction the swell travels in, x then z. */
  direction: [number, number];
  peakWavelength: number;
}

export function buildCoastalField(o: CoastalOptions): CoastalField {
  const n = o.resolution;
  const extent = o.extent;
  const dx = extent / n;
  const dir = o.direction;
  const angle0 = Math.atan2(dir[1], dir[0]);
  const k0 = (2 * Math.PI) / o.peakWavelength;
  const omega2 = 9.81 * k0;
  const c0 = Math.sqrt(9.81 / k0);
  const bed = new Float32Array(n * n);
  const slow = new Float32Array(n * n);
  const travel = new Float64Array(n * n).fill(1e8);
  const fixed = new Uint8Array(n * n);
  const worldX = (x: number) => (x + 0.5) * dx - extent * 0.5;
  // Plane-wave arrival time, offset so it is positive everywhere on the map.
  const reference = (wx: number, wz: number) => wx * dir[0] + wz * dir[1] + extent;
  // Swell enters along the edges it travels away from.
  const seedX0 = dir[0] > 0.2;
  const seedX1 = dir[0] < -0.2;
  const seedZ0 = dir[1] > 0.2;
  const seedZ1 = dir[1] < -0.2;

  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      const wx = worldX(x);
      const wz = worldX(z);
      bed[i] = o.bedAt(wx, wz);
      const h = Math.max(0.38, -bed[i]);
      // Finite-depth dispersion: omega^2 = g k tanh(k h), solved for k by Newton.
      let k = Math.max(k0, Math.sqrt(omega2 / (9.81 * h)));
      for (let j = 0; j < 5; j++) {
        const t = Math.tanh(k * h);
        k = Math.max(k0, k - (9.81 * k * t - omega2) / (9.81 * (t + k * h * (1 - t * t))));
      }
      slow[i] = k / Math.sqrt(omega2);
      // Waves cannot travel through land.
      if (bed[i] > 1.8) continue;
      if ((seedX0 && x === 0) || (seedX1 && x === n - 1) || (seedZ0 && z === 0) || (seedZ1 && z === n - 1)) {
        travel[i] = reference(wx, wz) / c0;
        fixed[i] = 1;
      }
    }
  }

  // Monotone Godunov fast sweeps solve |grad T| = 1 / c(h), letting arrivals
  // wrap around both sides of a headland or an island.
  const sweeps: [number, number][] = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];
  for (let cycle = 0; cycle < 8; cycle++) {
    for (const [sx, sz] of sweeps) {
      for (let zz = 0; zz < n; zz++) {
        for (let xx = 0; xx < n; xx++) {
          const x = sx > 0 ? xx : n - xx - 1;
          const z = sz > 0 ? zz : n - zz - 1;
          const i = z * n + x;
          if (fixed[i] || bed[i] > 1.8) continue;
          const a = Math.min(x ? travel[i - 1] : 1e8, x + 1 < n ? travel[i + 1] : 1e8);
          const b = Math.min(z ? travel[i - n] : 1e8, z + 1 < n ? travel[i + n] : 1e8);
          const step = slow[i] * dx;
          const diff = Math.abs(a - b);
          const value = diff >= step ? Math.min(a, b) + step : (a + b + Math.sqrt(Math.max(0, 2 * step * step - diff * diff))) * 0.5;
          if (value < travel[i]) travel[i] = value;
        }
      }
    }
  }

  // Bed lookup on the solved grid for the exposure rays; clamps at the edges.
  const bedAtGrid = (wx: number, wz: number) => {
    const ix = Math.max(0, Math.min(n - 1, Math.floor((wx / extent + 0.5) * n)));
    const iz = Math.max(0, Math.min(n - 1, Math.floor((wz / extent + 0.5) * n)));
    return bed[iz * n + ix];
  };

  const data = new Float32Array(n * n * 4);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      const wx = worldX(x);
      const wz = worldX(z);
      if (travel[i] > 1e7) {
        data.set([0, dir[0], dir[1], 0.04], i * 4);
        continue;
      }
      const validTime = (j: number) => (travel[j] > 1e7 ? travel[i] : travel[j]);
      const gx = validTime(z * n + Math.min(n - 1, x + 1)) - validTime(z * n + Math.max(0, x - 1));
      const gz = validTime(Math.min(n - 1, z + 1) * n + x) - validTime(Math.max(0, z - 1) * n + x);
      const len = Math.hypot(gx, gz) || 1;
      // Directional fetch: a fan of incident rays marched upwind. Headlands
      // take the full swell, coves in their lee stay quiet.
      let exposure = 0;
      for (let ray = -3; ray <= 3; ray++) {
        const angle = angle0 + ray * 0.14;
        const rx = Math.cos(angle);
        const rz = Math.sin(angle);
        let energy = 1;
        for (let step = 1; step <= 28; step++) {
          const distance = step * 12;
          const h = bedAtGrid(wx - rx * distance, wz - rz * distance);
          if (h > 0.8) {
            energy = 0.025;
            break;
          }
          if (h > -0.5) energy *= 0.87;
        }
        exposure += energy / 7;
      }
      exposure = 0.09 + 0.91 * exposure;
      const lead = Math.max(-10, Math.min(800, travel[i] * c0 - reference(wx, wz)));
      data.set([lead, gx / len, gz / len, exposure], i * 4);
    }
  }

  const pixels = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) pixels[i] = THREE.DataUtils.toHalfFloat(data[i]);
  const texture = new THREE.DataTexture(pixels, n, n, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return { texture, data, resolution: n, direction: dir, c0 };
}
