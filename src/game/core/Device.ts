/**
 * Whether to show on-screen touch controls. `?touch=1` and `?touch=0` force
 * the answer so the layout can be checked from a desktop browser or a headless
 * test; otherwise a coarse primary pointer (phones, tablets) decides, with a
 * touch-capable small window as a fallback for browsers that do not report it.
 */
export function detectTouchMode(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search).get("touch");
  if (q === "1") return true;
  if (q === "0") return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) <= 900;
  return coarse || (navigator.maxTouchPoints > 0 && small);
}
