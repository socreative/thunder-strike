import type { MissionStats } from "./Store";

/** One row on a mission's board, as the server stores and returns it. */
export interface ScoreEntry {
  name: string;
  score: number;
  elapsed: number;
  kills: number;
  rescued: number;
  /** Unix milliseconds when it was posted. */
  at: number;
}

export interface ScoreRow extends ScoreEntry {
  rank: number;
  you?: boolean;
}

export const NAME_MAX = 12;
export const DEFAULT_NAME = "PILOT";

/** Arcade-style call sign: letters, digits and a few separators, upper case, at most twelve. */
export function sanitizeName(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9 _.\-]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, NAME_MAX)
    .trim();
  return cleaned || DEFAULT_NAME;
}

/**
 * Mission score. Shared by the client, which shows it on the results card,
 * and the server, which recomputes it from the posted stats so the two never
 * disagree. Completing the mission is worth the bulk of it; a fast, clean run
 * with everyone rescued is what climbs the board.
 */
export function scoreFor(stats: MissionStats): number {
  const timeBonus = Math.max(0, 1800 - stats.elapsed) * 2;
  const raw = 5000 + stats.kills * 100 + stats.rescued * 500 + timeBonus - stats.damageTaken - stats.livesLost * 1500;
  return Math.max(0, Math.round(raw));
}

/** The fields of the stats the server needs, with anything odd clamped. */
export function statsFromBody(body: unknown): MissionStats | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const num = (k: string, max: number) => {
    const v = Number(b[k]);
    return Number.isFinite(v) ? Math.min(Math.max(0, v), max) : NaN;
  };
  const stats: MissionStats = {
    kills: num("kills", 1000),
    rescued: num("rescued", 100),
    shotsFired: num("shotsFired", 1e6),
    damageTaken: num("damageTaken", 1e6),
    livesLost: num("livesLost", 100),
    elapsed: num("elapsed", 86400),
  };
  for (const v of Object.values(stats)) if (Number.isNaN(v)) return null;
  return stats;
}
