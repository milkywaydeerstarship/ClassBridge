import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rooms, presence, messages, translations } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

async function findRoom(code: string) {
  const normalized = (code ?? "").toUpperCase().trim();
  const found = await db.select().from(rooms).where(eq(rooms.code, normalized)).limit(1);
  return found[0] ?? null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const room = await findRoom(code);
  if (!room) return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });

  try {
    const body = await req.json().catch(() => ({}));
    const hostSecret = String(body?.hostSecret ?? "").trim();
    const action = String(body?.action ?? "").trim();

    // Verify host authority
    if (!room.hostSecret || room.hostSecret !== hostSecret) {
      return NextResponse.json({ ok: false, error: "Unauthorized: only the teacher can perform this action." }, { status: 403 });
    }

    // 1. CLOSE ROOM & KICK EVERYONE OUT
    if (action === "close_room") {
      await db
        .update(rooms)
        .set({ isClosed: true, closedAt: new Date(), liveText: null })
        .where(eq(rooms.id, room.id));

      // Mark all presence records as kicked so active clients disconnect
      await db
        .update(presence)
        .set({ isKicked: true })
        .where(eq(presence.roomId, room.id));

      return NextResponse.json({ ok: true, message: "Room closed and all participants kicked out." });
    }

    // 2. REOPEN ROOM
    if (action === "reopen_room") {
      await db
        .update(rooms)
        .set({ isClosed: false, closedAt: null })
        .where(eq(rooms.id, room.id));

      return NextResponse.json({ ok: true, message: "Room reopened." });
    }

    // 3. MUTE OR UNMUTE SPECIFIC PARTICIPANT
    if (action === "toggle_mute") {
      const participantKey = String(body?.participantKey ?? "").trim();
      const presenceId = body?.presenceId ? String(body.presenceId).trim() : null;

      let targetRecord = null;
      if (participantKey) {
        const foundP = await db
          .select()
          .from(presence)
          .where(and(eq(presence.roomId, room.id), eq(presence.participantKey, participantKey)))
          .limit(1);
        targetRecord = foundP[0];
      } else if (presenceId) {
        const foundP = await db
          .select()
          .from(presence)
          .where(and(eq(presence.roomId, room.id), eq(presence.id, presenceId)))
          .limit(1);
        targetRecord = foundP[0];
      }

      if (!targetRecord) {
        return NextResponse.json({ ok: false, error: "Participant not found." }, { status: 404 });
      }

      const newMuteState = body?.isMuted !== undefined ? Boolean(body.isMuted) : !targetRecord.isMuted;

      await db
        .update(presence)
        .set({ isMuted: newMuteState })
        .where(eq(presence.id, targetRecord.id));

      return NextResponse.json({
        ok: true,
        participantId: targetRecord.id,
        displayName: targetRecord.displayName,
        isMuted: newMuteState,
      });
    }

    // 4. MUTE ALL STUDENTS
    if (action === "mute_all") {
      await db
        .update(presence)
        .set({ isMuted: true })
        .where(and(eq(presence.roomId, room.id), eq(presence.isHost, false)));

      return NextResponse.json({ ok: true, message: "All students muted." });
    }

    // 5. UNMUTE ALL STUDENTS
    if (action === "unmute_all") {
      await db
        .update(presence)
        .set({ isMuted: false })
        .where(eq(presence.roomId, room.id));

      return NextResponse.json({ ok: true, message: "All students unmuted." });
    }

    // 6. KICK SPECIFIC STUDENT OUT
    if (action === "kick_participant") {
      const participantKey = String(body?.participantKey ?? "").trim();
      const presenceId = body?.presenceId ? String(body.presenceId).trim() : null;

      let targetRecord = null;
      if (participantKey) {
        const foundP = await db
          .select()
          .from(presence)
          .where(and(eq(presence.roomId, room.id), eq(presence.participantKey, participantKey)))
          .limit(1);
        targetRecord = foundP[0];
      } else if (presenceId) {
        const foundP = await db
          .select()
          .from(presence)
          .where(and(eq(presence.roomId, room.id), eq(presence.id, presenceId)))
          .limit(1);
        targetRecord = foundP[0];
      }

      if (!targetRecord) {
        return NextResponse.json({ ok: false, error: "Participant not found." }, { status: 404 });
      }

      await db
        .update(presence)
        .set({ isKicked: true })
        .where(eq(presence.id, targetRecord.id));

      return NextResponse.json({ ok: true, message: `${targetRecord.displayName} has been kicked.` });
    }

    // 7. CLEAR ALL TRANSCRIPT
    if (action === "clear_transcript") {
      const rows = await db.select({ id: messages.id }).from(messages).where(eq(messages.roomId, room.id));
      const ids = rows.map((r) => r.id);
      if (ids.length > 0) {
        await db.delete(translations).where(inArray(translations.messageId, ids));
        await db.delete(messages).where(eq(messages.roomId, room.id));
      }
      await db
        .update(rooms)
        .set({ liveText: null, liveUpdatedAt: new Date() })
        .where(eq(rooms.id, room.id));

      return NextResponse.json({ ok: true, message: "Transcript cleared." });
    }

    return NextResponse.json({ ok: false, error: "Invalid action." }, { status: 400 });
  } catch (e) {
    console.error("admin action failed", e);
    return NextResponse.json({ ok: false, error: "Failed to process teacher action." }, { status: 500 });
  }
}
