import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rooms, messages } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const normalized = (code ?? "").toUpperCase().trim();
  try {
    const found = await db.select().from(rooms).where(eq(rooms.code, normalized)).limit(1);
    if (found.length === 0) {
      return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });
    }
    const room = found[0];
    const countRes = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .where(eq(messages.roomId, room.id));
    return NextResponse.json({
      ok: true,
      room: {
        code: room.code,
        name: room.name,
        sourceLang: room.sourceLang,
        hasPin: !!room.pin,
        createdAt: room.createdAt,
        messageCount: countRes[0]?.n ?? 0,
      },
    });
  } catch (e) {
    console.error("get room failed", e);
    return NextResponse.json({ ok: false, error: "Could not load room" }, { status: 500 });
  }
}
