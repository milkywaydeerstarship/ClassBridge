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
    // Make sure the tables exist before the first insert (fresh databases).
    await ensureSchema();

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "Live Room").slice(0, 120).trim() || "Live Room";
    const sourceLang = String(body?.sourceLang ?? "en").slice(0, 12) || "en";
    const rawPin = body?.pin != null ? String(body.pin).trim().slice(0, 12) : "";
    const pin = rawPin.length >= 4 ? rawPin : null;
    const displayName = String(body?.displayName ?? "Host").slice(0, 80).trim() || "Host";
    const langsRaw = String(body?.langs ?? sourceLang).slice(0, 120);
    const langs = langsRaw || "en";

    let code = makeCode(6);
    for (let i = 0; i < 5; i++) {
      const existing = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code)).limit(1);
      if (existing.length === 0) break;
      code = makeCode(6);
    }

    const inserted = await db
      .insert(rooms)
      .values({ code, name, sourceLang, pin })
      .returning({ id: rooms.id, code: rooms.code });

    const room = inserted[0];
    await db.insert(presence).values({ roomId: room.id, displayName, langs });

    return NextResponse.json({ ok: true, code: room.code, hasPin: !!pin });
  } catch (e) {
    console.error("create room failed", e);
    return NextResponse.json(
      { ok: false, error: `Could not create room: ${describeError(e)}` },
      { status: 500 }
    );
  }
}
