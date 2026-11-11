import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rooms, presence } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";

async function findRoom(code: string) {
  const normalized = (code ?? "").toUpperCase().trim();
  const found = await db.select().from(rooms).where(eq(rooms.code, normalized)).limit(1);
  return found[0] ?? null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const room = await findRoom(code);
  if (!room) return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });

  const url = new URL(req.url);
  const myKey = url.searchParams.get("participantKey");

  const cutoff = new Date(Date.now() - 90_000);
  const rows = await db
    .select()
    .from(presence)
    .where(and(eq(presence.roomId, room.id), eq(presence.isKicked, false)))
    .orderBy(desc(presence.lastSeen))
    .limit(80);

  const active = rows.filter((r) => new Date(r.lastSeen).getTime() > cutoff.getTime());

  // Language distribution
  const dist: Record<string, number> = {};
  for (const r of active) {
    for (const l of r.langs.split(",").map((s) => s.trim()).filter(Boolean)) {
      dist[l] = (dist[l] ?? 0) + 1;
    }
  }

  // Check current viewer status
  let myStatus = { isMuted: false, isKicked: false };
  if (myKey) {
    const me = await db
      .select()
      .from(presence)
      .where(and(eq(presence.roomId, room.id), eq(presence.participantKey, myKey)))
      .limit(1);
    if (me.length > 0) {
      myStatus = { isMuted: me[0].isMuted, isKicked: me[0].isKicked };
    }
  }

  // Prune very stale records
  try {
    const pruneCutoff = new Date(Date.now() - 300_000);
    await db.delete(presence).where(sql`${presence.roomId} = ${room.id} AND ${presence.lastSeen} < ${pruneCutoff}`);
  } catch { /* ignore */ }

  return NextResponse.json({
    ok: true,
    isClosed: room.isClosed ?? false,
    myStatus,
    count: active.length,
    people: active.map((r) => ({
      id: r.id,
      name: r.displayName,
      participantKey: r.participantKey,
      langs: r.langs,
      isMuted: r.isMuted,
      isHost: r.isHost,
    })),
    distribution: dist,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const room = await findRoom(code);
  if (!room) return NextResponse.json({ ok: false }, { status: 404 });
  try {
    const body = await req.json().catch(() => ({}));
    const displayName = String(body?.displayName ?? "").slice(0, 80).trim();
    if (!displayName) {
      return NextResponse.json({ ok: false, error: "Display name required" }, { status: 400 });
    }
    const langs = String(body?.langs ?? "en").slice(0, 120) || "en";
    const participantKey = body?.participantKey ? String(body.participantKey).slice(0, 64) : null;
    const isHost = Boolean(body?.isHost);

    if (participantKey) {
      // Update existing presence
      const existing = await db
        .select()
        .from(presence)
        .where(and(eq(presence.roomId, room.id), eq(presence.participantKey, participantKey)))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(presence)
          .set({ displayName, langs, lastSeen: new Date() })
          .where(eq(presence.id, existing[0].id));

        return NextResponse.json({
          ok: true,
          isMuted: existing[0].isMuted,
          isKicked: existing[0].isKicked,
          isClosed: room.isClosed ?? false,
        });
      }
    }

    // Otherwise insert new
    await db.insert(presence).values({
      roomId: room.id,
      displayName,
      participantKey,
      langs,
      isHost,
      isMuted: false,
      isKicked: false,
    });

    return NextResponse.json({ ok: true, isClosed: room.isClosed ?? false });
  } catch (e) {
    console.error("presence failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
