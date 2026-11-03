import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rooms, presence } from "@/db/schema";
import { eq } from "drizzle-orm";

function makeToken(len = 24): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const normalized = (code ?? "").toUpperCase().trim();
  try {
    const body = await req.json().catch(() => ({}));
    const found = await db.select().from(rooms).where(eq(rooms.code, normalized)).limit(1);
    if (found.length === 0) {
      return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });
    }
    const room = found[0];

    if (room.isClosed) {
      return NextResponse.json({ ok: false, error: "This room has been closed by the teacher." }, { status: 403 });
    }

    if (room.pin) {
      const pin = String(body?.pin ?? "").trim();
      if (pin !== room.pin) {
        return NextResponse.json({ ok: false, error: "Incorrect room PIN" }, { status: 403 });
      }
    }

    const displayName = String(body?.displayName ?? "").slice(0, 80).trim();
    if (!displayName) {
      return NextResponse.json({ ok: false, error: "A name is required to join this room." }, { status: 400 });
    }

    const langs = String(body?.langs ?? "en").slice(0, 120) || "en";
    const participantKey = makeToken(24);

    await db.insert(presence).values({
      roomId: room.id,
      displayName,
      participantKey,
      langs,
      isHost: false,
      isMuted: false,
      isKicked: false,
    });

    return NextResponse.json({
      ok: true,
      participantKey,
      room: {
        code: room.code,
        name: room.name,
        sourceLang: room.sourceLang,
        hasPin: !!room.pin,
        isClosed: room.isClosed ?? false,
      },
    });
  } catch (e) {
    console.error("join failed", e);
    return NextResponse.json({ ok: false, error: "Could not join room" }, { status: 500 });
  }
}
