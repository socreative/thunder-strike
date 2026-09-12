import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

export interface ModelSpec {
  name: string;
  url: string;
  /** Uniform scale to bring the model to roughly world size (metres). */
  scale: number;
  /** Extra yaw so the model's nose points down +Z. */
  yaw?: number;
  /** Lift so wheels or skids sit on the ground. */
  lift?: number;
  /**
   * Multiplier on the base colour, for a model whose textures were baked far
   * darker than this game's daylight. Leave unset for anything that already
   * reads correctly.
   */
  brighten?: number;
}

/** Models fetched by scripts/fetch-assets.mjs. Missing files fall back to primitives. */
export const MODEL_SPECS: ModelSpec[] = [
  { name: "helicopter", url: "/models/helicopter.glb", scale: 1, yaw: 0 },
  { name: "tank", url: "/models/tank.glb", scale: 1, yaw: 0 },
  { name: "lightTank", url: "/models/light-tank.glb", scale: 1, yaw: 0 },
  { name: "jeep", url: "/models/jeep.glb", scale: 1, yaw: 0 },
  { name: "truck", url: "/models/truck.glb", scale: 1, yaw: 0 },
  // The patrol boat is textured for a night scene and comes out almost black.
  { name: "boat", url: "/models/boat.glb", scale: 1, yaw: 0, brighten: 1.9 },
  { name: "carrier", url: "/models/carrier.glb", scale: 1, yaw: 0 },
  { name: "jet", url: "/models/jet.glb", scale: 1, yaw: 0 },
  { name: "tent", url: "/models/tent.glb", scale: 1, yaw: 0 },
  { name: "hellfire", url: "/models/hellfire.glb", scale: 1, yaw: 0 },
  { name: "spike", url: "/models/spike.glb", scale: 1, yaw: 0 },
  { name: "sam", url: "/models/sam.glb", scale: 1, yaw: 0 },
];

/**
 * Loads optional glTF models. Any failure is swallowed and recorded so the
 * caller can build a procedural placeholder instead.
 */
export class Assets {
  private models = new Map<string, THREE.Group>();
  private bounds = new Map<string, THREE.Box3>();
  readonly missing: string[] = [];

  async load(onProgress: (done: number, total: number, label: string) => void): Promise<void> {
    const loader = new GLTFLoader();
    let done = 0;
    const total = MODEL_SPECS.length;
    await Promise.all(
      MODEL_SPECS.map(async (spec) => {
        try {
          const head = await fetch(spec.url, { method: "HEAD" });
          if (!head.ok) throw new Error(`${spec.url} ${head.status}`);
          const gltf = await loader.loadAsync(spec.url);
          const root = gltf.scene;
          const seen = new Set<THREE.Material>();
          root.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              // Nothing here lights a mirror: the scene has a sun and a
              // hemisphere light but no environment to reflect, so a fully
              // metallic material has nothing to return and renders black.
              // The patrol boat ships with its whole hull authored at metal
              // 1.0, which is what this cap is for; models that use metal
              // honestly sit far below it and are left alone.
              for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
                const pbr = m as THREE.MeshStandardMaterial;
                if (pbr.isMeshStandardMaterial && !seen.has(pbr)) {
                  seen.add(pbr);
                  pbr.metalness = Math.min(pbr.metalness, 0.25);
                  if (spec.brighten) pbr.color.multiplyScalar(spec.brighten);
                }
              }
            }
          });
          // Normalise: centre on XZ, rest on y = 0, then apply the spec scale.
          const box = new THREE.Box3().setFromObject(root);
          const size = new THREE.Vector3();
          box.getSize(size);
          const centre = new THREE.Vector3();
          box.getCenter(centre);
          const wrapper = new THREE.Group();
          root.position.set(-centre.x, -box.min.y, -centre.z);
          wrapper.add(root);
          wrapper.rotation.y = spec.yaw ?? 0;
          wrapper.scale.setScalar(spec.scale);
          wrapper.position.y = spec.lift ?? 0;
          this.models.set(spec.name, wrapper);
          this.bounds.set(spec.name, new THREE.Box3().setFromObject(wrapper));
        } catch (err) {
          this.missing.push(spec.name);
          if (process.env.NODE_ENV !== "production") {
            console.info(`[assets] ${spec.name} unavailable, using placeholder`, err instanceof Error ? err.message : err);
          }
        } finally {
          done++;
          onProgress(done, total, spec.name);
        }
      }),
    );
  }

  has(name: string): boolean {
    return this.models.has(name);
  }

  /** Deep clone (skeleton aware) so each entity can animate and tint independently. */
  get(name: string): THREE.Group | null {
    const m = this.models.get(name);
    if (!m) return null;
    const clone = cloneSkeleton(m) as THREE.Group;
    // Clones share geometry with the cached model, so a world tearing itself
    // down must leave that geometry alone or the next world draws destroyed buffers.
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.userData.sharedGeometry = true;
    });
    return clone;
  }

  /** Approximate footprint of a loaded model, or null. */
  size(name: string): THREE.Vector3 | null {
    const b = this.bounds.get(name);
    if (!b) return null;
    const v = new THREE.Vector3();
    b.getSize(v);
    return v;
  }
}
