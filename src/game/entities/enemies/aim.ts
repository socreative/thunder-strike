import * as THREE from "three/webgpu";

const predicted = new THREE.Vector3();

/**
 * Direction from muzzle toward where a moving target will be when a round of
 * the given speed arrives, with a little random error.
 */
export function leadTarget(muzzle: THREE.Vector3, target: { pos: THREE.Vector3; vel: THREE.Vector3 }, speed: number, out: THREE.Vector3, error: number): THREE.Vector3 {
  const dist = muzzle.distanceTo(target.pos);
  const t = dist / speed;
  predicted.copy(target.pos).addScaledVector(target.vel, t * 0.9);
  out.copy(predicted).sub(muzzle);
  out.x += (Math.random() - 0.5) * error * dist;
  out.y += (Math.random() - 0.5) * error * dist * 0.5;
  out.z += (Math.random() - 0.5) * error * dist;
  return out.normalize();
}
