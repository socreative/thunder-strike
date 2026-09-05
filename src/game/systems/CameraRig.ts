import * as THREE from "three/webgpu";
import { balance } from "../data/balance";
import { clamp, damp } from "../core/MathUtil";

const C = balance.camera;
const tmpTarget = new THREE.Vector3();
const tmpOffset = new THREE.Vector3();

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
    this.distance = damp(this.distance, this.distance, 1, 0);
  }
}
