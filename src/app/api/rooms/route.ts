import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rooms, presence } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { ensureSchema } from "@/lib/ensure-schema";
import { describeError } from "@/lib/errors";

function makeCode(len = 6): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function makeToken(len = 24): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

// Browser-friendly database test: open /api/rooms on your site.
export async function GET() {
  try {
    await ensureSchema();
    const rows = await db.select({ n: sql<number>`count(*)::int` }).from(rooms);
    return NextResponse.json({ ok: true, roomsInDatabase: rows[0]?.n ?? 0 });
  } catch (e) {
    console.error("rooms GET failed", e);
    return NextResponse.json({ ok: false, error: describeError(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "Live Class").slice(0, 120).trim() || "Live Class";
    const sourceLang = String(body?.sourceLang ?? "en").slice(0, 12) || "en";
    const rawPin = body?.pin != null ? String(body.pin).trim().slice(0, 12) : "";
    const pin = rawPin.length >= 4 ? rawPin : null;
    const displayName = String(body?.displayName ?? "").slice(0, 80).trim();

    if (!displayName) {
      return NextResponse.json({ ok: false, error: "Please enter your name." }, { status: 400 });
    }

    const langsRaw = String(body?.langs ?? sourceLang).slice(0, 120);
    const langs = langsRaw || "en";
    const hostSecret = makeToken(32);
    const hostParticipantKey = makeToken(24);

    let code = makeCode(6);
    for (let i = 0; i < 5; i++) {
      const existing = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code)).limit(1);
      if (existing.length === 0) break;
      code = makeCode(6);
    }

    const inserted = await db
      .insert(rooms)
      .values({ code, name, sourceLang, pin, hostSecret, isClosed: false })
      .returning({ id: rooms.id, code: rooms.code });

    const room = inserted[0];
    await db.insert(presence).values({
      roomId: room.id,
      displayName,
      participantKey: hostParticipantKey,
      langs,
      isHost: true,
      isMuted: false,
      isKicked: false,
    });

    return NextResponse.json({
      ok: true,
      code: room.code,
      hasPin: !!pin,
      hostSecret,
      participantKey: hostParticipantKey,
    });
  } catch (e) {
    console.error("create room failed", e);
    return NextResponse.json(
      { ok: false, error: `Could not create room: ${describeError(e)}` },
      { status: 500 }
    );
  }
}
