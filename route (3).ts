import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rooms, presence } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { filterProfanity } from "@/lib/profanity";

async function findRoom(code: string) {
  const normalized = (code ?? "").toUpperCase().trim();
  const found = await db.select().from(rooms).where(eq(rooms.code, normalized)).limit(1);
  return found[0] ?? null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const room = await findRoom(code);
  if (!room) return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });
  const stale = room.liveUpdatedAt
    ? Date.now() - new Date(room.liveUpdatedAt).getTime() > 12000
    : true;
  return NextResponse.json({
    ok: true,
    isClosed: room.isClosed ?? false,
    live: room.liveText && !stale && !room.isClosed
      ? {
          text: room.liveText,
          sourceLang: room.liveSourceLang ?? room.sourceLang,
          speaker: room.liveSpeaker ?? "Speaker",
          updatedAt: room.liveUpdatedAt,
        }
      : null,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const room = await findRoom(code);
  if (!room) return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });

  if (room.isClosed) {
    return NextResponse.json({ ok: false, error: "Room is closed." }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawText = String(body?.text ?? "").slice(0, 600);
    const sourceLang = String(body?.sourceLang ?? room.sourceLang).slice(0, 12);
    const speaker = String(body?.speaker ?? "Speaker").slice(0, 80);
    const participantKey = body?.participantKey ? String(body.participantKey).trim() : null;

    if (participantKey) {
      const p = await db
        .select()
        .from(presence)
        .where(and(eq(presence.roomId, room.id), eq(presence.participantKey, participantKey)))
        .limit(1);
      if (p.length > 0 && (p[0].isMuted || p[0].isKicked)) {
        return NextResponse.json({ ok: false, error: "Muted or removed." }, { status: 403 });
      }
    }

    if (!rawText.trim()) {
      await db
        .update(rooms)
        .set({ liveText: null, liveUpdatedAt: new Date() })
        .where(eq(rooms.id, room.id));
      return NextResponse.json({ ok: true, live: null });
    }

    // Apply profanity filter to live captions
    const { cleanText } = filterProfanity(rawText);

    await db
      .update(rooms)
      .set({ liveText: cleanText, liveSourceLang: sourceLang, liveSpeaker: speaker, liveUpdatedAt: new Date() })
      .where(eq(rooms.id, room.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("live POST failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const room = await findRoom(code);
  if (!room) return NextResponse.json({ ok: false }, { status: 404 });
  await db.update(rooms).set({ liveText: null, liveUpdatedAt: new Date() }).where(eq(rooms.id, room.id));
  return NextResponse.json({ ok: true });
}
