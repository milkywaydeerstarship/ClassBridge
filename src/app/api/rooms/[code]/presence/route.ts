import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rooms, presence } from "@/db/schema";
import { eq, gt, desc, sql } from "drizzle-orm";

async function findRoom(code: string) {
  const normalized = (code ?? "").toUpperCase().trim();
  const found = await db.select().from(rooms).where(eq(rooms.code, normalized)).limit(1);
  return found[0] ?? null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const room = await findRoom(code);
  if (!room) return NextResponse.json({ ok: false }, { status: 404 });
  const cutoff = new Date(Date.now() - 90_000);
  const rows = await db
    .select()
    .from(presence)
    .where(eq(presence.roomId, room.id))
    .orderBy(desc(presence.lastSeen))
    .limit(60);
  const active = rows.filter((r) => new Date(r.lastSeen).getTime() > cutoff.getTime());
  // language distribution
  const dist: Record<string, number> = {};
  for (const r of active) {
    for (const l of r.langs.split(",").map((s) => s.trim()).filter(Boolean)) {
      dist[l] = (dist[l] ?? 0) + 1;
    }
  }
  // prune stale occasionally
  try {
    await db.delete(presence).where(sql`${presence.roomId} = ${room.id} AND ${presence.lastSeen} < ${cutoff}`);
  } catch { /* ignore */ }
  return NextResponse.json({
    ok: true,
    count: active.length,
    people: active.slice(0, 24).map((r) => ({ name: r.displayName, langs: r.langs })),
    distribution: dist,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const room = await findRoom(code);
  if (!room) return NextResponse.json({ ok: false }, { status: 404 });
  try {
    const body = await req.json().catch(() => ({}));
    const displayName = String(body?.displayName ?? "Guest").slice(0, 80).trim() || "Guest";
    const langs = String(body?.langs ?? "en").slice(0, 120) || "en";
    await db.insert(presence).values({ roomId: room.id, displayName, langs });
    // keep table small: delete older duplicates for same name
    void gt;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("presence failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
