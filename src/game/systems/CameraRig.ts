import * as THREE from "three/webgpu";
import { balance } from "../data/balance";
import { clamp } from "../core/MathUtil";

const C = balance.camera;
const tmpTarget = new THREE.Vector3();
const tmpOffset = new THREE.Vector3();
/** Beyond this the ground is effectively at the horizon and not worth shadowing. */
const FAR_CLAMP = 420;

/**
 * Fixed-angle chase camera in the isometric spirit of the original: the yaw
 * never changes, the aircraft turns underneath it.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  distance = C.distance;
  private lookAt = new THREE.Vector3();
  private shakeSeed = Math.random() * 100;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(42, aspect, 1, 3000);
  }

  snapTo(target: THREE.Vector3): void {
    this.lookAt.copy(target);
    this.place(0, 0);
  }

  zoom(deltaY: number): void {
    this.distance = clamp(this.distance + deltaY * 0.06, C.minDistance, C.maxDistance);
  }

  update(dt: number, target: THREE.Vector3, velocity: THREE.Vector3, shake: number, time: number): void {
    tmpTarget.copy(target).addScaledVector(velocity, C.lead);
    tmpTarget.y = target.y;
    const k = 1 - Math.exp(-C.followLambda * dt);
    this.lookAt.lerp(tmpTarget, k);
    this.place(shake, time);
  }

  private place(shake: number, time: number): void {
    const pitch = C.pitch;
    tmpOffset.set(Math.sin(C.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(C.yaw) * Math.cos(pitch)).multiplyScalar(this.distance);
    this.camera.position.copy(this.lookAt).add(tmpOffset);
    if (shake > 0) {
      const s = shake * 0.6;
      this.camera.position.x += Math.sin(time * 61 + this.shakeSeed) * s;
      this.camera.position.y += Math.sin(time * 53 + this.shakeSeed * 2) * s;
      this.camera.position.z += Math.cos(time * 47 + this.shakeSeed * 3) * s;
    }
    this.camera.lookAt(this.lookAt);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Centre and radius of the ground the camera can actually see.
   *
   * The visible footprint is not centred on the aircraft: the view runs much
   * further away from the camera than toward it, so a shadow frustum centred
   * on the aircraft misses the top of the screen entirely. Corners are found
   * by intersecting the four frustum edge rays with the ground plane.
   */
  groundFootprint(groundY: number, out: THREE.Vector3): number {
    const pitch = C.pitch;
    const vf = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * this.camera.aspect);
    const camHeight = Math.max(1, this.camera.position.y - groundY);
    // Horizontal reach of the top and bottom frustum edges.
    const far = Math.min(FAR_CLAMP, camHeight / Math.tan(Math.max(0.08, pitch - vf)));
    const near = camHeight / Math.tan(pitch + vf);
    // Along-view axis, pointing away from the camera.
    const ax = -Math.sin(C.yaw);
    const az = -Math.cos(C.yaw);
    const camX = this.camera.position.x;
    const camZ = this.camera.position.z;
    let minA = Infinity;
    let maxA = -Infinity;
    let maxL = 0;
    for (const d of [near, far]) {
      const lateral = d * Math.tan(hf);
      if (d < minA) minA = d;
      if (d > maxA) maxA = d;
      if (lateral > maxL) maxL = lateral;
    }
    const midA = (minA + maxA) / 2;
    out.set(camX + ax * midA, groundY, camZ + az * midA);
    const halfA = (maxA - minA) / 2;
    // The shadow volume is a square in light space, so its inscribed circle is
    // smaller than its diagonal: pad it rather than clip the far corners.
    return Math.sqrt(halfA * halfA + maxL * maxL) * 1.08 + 6;
  }
}
