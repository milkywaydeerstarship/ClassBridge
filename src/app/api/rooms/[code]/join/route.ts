import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rooms, presence } from "@/db/schema";
import { eq } from "drizzle-orm";

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
    if (room.pin) {
      const pin = String(body?.pin ?? "").trim();
      if (pin !== room.pin) {
        return NextResponse.json({ ok: false, error: "Incorrect room PIN" }, { status: 403 });
      }
    }
    const displayName = String(body?.displayName ?? "Guest").slice(0, 80).trim() || "Guest";
    const langs = String(body?.langs ?? "en").slice(0, 120) || "en";
    await db.insert(presence).values({ roomId: room.id, displayName, langs });
    return NextResponse.json({
      ok: true,
      room: { code: room.code, name: room.name, sourceLang: room.sourceLang, hasPin: !!room.pin },
    });
  } catch (e) {
    console.error("join failed", e);
    return NextResponse.json({ ok: false, error: "Could not join room" }, { status: 500 });
  }
}
