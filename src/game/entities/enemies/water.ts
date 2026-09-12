import type { Terrain } from "../../world/Terrain";

/**
 * Shore avoidance for boats, worked out from the seabed rather than from a
 * river channel. A map of scattered islands has no centreline to run back to,
 * so a boat probes the water a little ahead and to either bow, and turns away
 * from whichever side is shoaling.
 *
 * Returns a heading offset in radians, zero when the water ahead is deep. On a
 * river map the channel is far deeper than `minDepth`, so this stays silent and
 * the existing centreline steering does the work.
 */
export function shoreBias(terrain: Terrain, x: number, z: number, heading: number, look: number, minDepth: number): number {
  const s = Math.sin(heading);
  const c = Math.cos(heading);
  const ahead = terrain.heightAt(x + s * look, z + c * look);
  if (ahead < -minDepth) return 0;
  // How hard to turn: nothing at the trigger depth, hard over once it is dry.
  const urgency = Math.min(1, (ahead + minDepth) / minDepth);
  // Compare the two bows and run for the deeper one. Ties turn to starboard.
  const side = look * 0.8;
  const port = terrain.heightAt(x + s * look * 0.6 - c * side, z + c * look * 0.6 + s * side);
  const stbd = terrain.heightAt(x + s * look * 0.6 + c * side, z + c * look * 0.6 - s * side);
  return (port < stbd ? -1 : 1) * urgency * 1.2;
}
