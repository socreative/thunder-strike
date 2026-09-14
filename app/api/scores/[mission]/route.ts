import { Redis } from "@upstash/redis";
import { sanitizeName, scoreFor, statsFromBody, type ScoreEntry, type ScoreRow } from "@/src/game/core/Score";

/** Rows returned to the client, and the most a mission's board keeps. */
const TOP = 20;
const KEEP = 100;
const MISSION_ID = /^[a-z0-9-]{1,32}$/;

/**
 * Per-mission leaderboard in a Redis sorted set: the entry is the member,
 * serialised to JSON, and the score is the sort key. One command inserts,
 * one reads the top of the board, one gives a rank.
 */
function store(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token, automaticDeserialization: false });
}

const key = (mission: string) => `scores:v1:${mission}`;

function parseRows(flat: (string | number)[], you?: string): ScoreRow[] {
  const rows: ScoreRow[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try {
      const entry = JSON.parse(String(flat[i])) as ScoreEntry;
      rows.push({ ...entry, score: Number(flat[i + 1]), rank: rows.length + 1, you: you !== undefined && flat[i] === you });
    } catch {
      /* a malformed member is skipped rather than failing the board */
    }
  }
  return rows;
}

async function top(redis: Redis, mission: string, you?: string): Promise<ScoreRow[]> {
  const flat = await redis.zrange<(string | number)[]>(key(mission), 0, TOP - 1, { rev: true, withScores: true });
  return parseRows(flat, you);
}

export async function GET(_req: Request, { params }: { params: Promise<{ mission: string }> }) {
  const { mission } = await params;
  if (!MISSION_ID.test(mission)) return Response.json({ error: "unknown mission" }, { status: 400 });
  const redis = store();
  if (!redis) return Response.json({ error: "leaderboard offline" }, { status: 503 });
  try {
    return Response.json({ rows: await top(redis, mission) });
  } catch (err) {
    console.error("[scores] read failed", err);
    return Response.json({ error: "leaderboard unavailable" }, { status: 502 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ mission: string }> }) {
  const { mission } = await params;
  if (!MISSION_ID.test(mission)) return Response.json({ error: "unknown mission" }, { status: 400 });
  const redis = store();
  if (!redis) return Response.json({ error: "leaderboard offline" }, { status: 503 });
  let body: { name?: unknown; stats?: unknown };
  try {
    body = (await req.json()) as { name?: unknown; stats?: unknown };
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const stats = statsFromBody(body.stats);
  if (!stats) return Response.json({ error: "bad stats" }, { status: 400 });
  const entry: ScoreEntry = {
    name: sanitizeName(typeof body.name === "string" ? body.name : ""),
    score: scoreFor(stats),
    elapsed: Math.round(stats.elapsed),
    kills: Math.round(stats.kills),
    rescued: Math.round(stats.rescued),
    at: Date.now(),
  };
  const member = JSON.stringify(entry);
  const k = key(mission);
  try {
    await redis.zadd(k, { score: entry.score, member });
    // Keep the board bounded: everything below the top hundred goes.
    await redis.zremrangebyrank(k, 0, -(KEEP + 1));
    const rank = await redis.zrevrank(k, member);
    const rows = await top(redis, mission, member);
    return Response.json({ score: entry.score, rank: rank === null ? null : rank + 1, rows });
  } catch (err) {
    console.error("[scores] write failed", err);
    return Response.json({ error: "leaderboard unavailable" }, { status: 502 });
  }
}
