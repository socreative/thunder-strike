/** Thin wrapper over gtag: a no-op when the tag is absent (development, blockers). */
type Gtag = (command: "event", name: string, params?: Record<string, string | number | boolean>) => void;

export function track(name: string, params: Record<string, string | number | boolean> = {}): void {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (!gtag) return;
  try {
    gtag("event", name, params);
  } catch {
    /* never let analytics break the game */
  }
}
