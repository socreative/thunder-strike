import type { Terrain } from "../../world/Terrain";

/**
 * Shore avoidance for boats, worked out from the seabed rather than from a
 * river channel. A map of scattered islands has no centreline to run back to,
 * so a boat looks at the water under it and a little ahead, and if either is
 * shoaling it heads straight down the slope of the bottom, which always points
 * out to sea.
 *
 * Returns the heading to steer, or null when the water is deep enough to leave
 * the boat alone. On a river map the channel is far deeper than `minDepth`, so
 * this never fires and the centreline steering does the work.
 */
export function shoreAvoid(terrain: Terrain, x: number, z: number, heading: number, look: number, minDepth: number): number | null {
  const ahead = terrain.heightAt(x + Math.sin(heading) * look, z + Math.cos(heading) * look);
  const worst = Math.max(terrain.heightAt(x, z), ahead);
  if (worst < -minDepth) return null;
  const e = 10;
  const gx = terrain.heightAt(x + e, z) - terrain.heightAt(x - e, z);
  const gz = terrain.heightAt(x, z + e) - terrain.heightAt(x, z - e);
  if (Math.abs(gx) + Math.abs(gz) < 1e-4) return null;
  // Down the slope of the bottom, which is away from whatever is shoaling.
  return Math.atan2(-gx, -gz);
}
