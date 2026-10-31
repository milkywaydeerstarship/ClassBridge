import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rooms, messages, translations } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { translateText } from "@/lib/translate-server";

async function findRoom(code: string) {
  const normalized = (code ?? "").toUpperCase().trim();
  const found = await db.select().from(rooms).where(eq(rooms.code, normalized)).limit(1);
  return found[0] ?? null;
}

function parseLangs(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

// GET latest messages with translations for requested langs
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  try {
    const room = await findRoom(code);
    if (!room) return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });

    const url = new URL(req.url);
    const langs = parseLangs(url.searchParams.get("langs"));
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "60", 10) || 60, 1), 150);

    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.roomId, room.id))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    const ordered = [...rows].reverse();
    if (ordered.length === 0 || langs.length === 0) {
      return NextResponse.json({
        ok: true,
        messages: ordered.map((m) => ({
          id: m.id,
          originalText: m.originalText,
          sourceLang: m.sourceLang,
          speakerName: m.speakerName,
          createdAt: m.createdAt,
          translations: {} as Record<string, string>,
        })),
      });
    }

    const ids = ordered.map((m) => m.id);
    const existing = await db
      .select()
      .from(translations)
      .where(inArray(translations.messageId, ids));

    const cache = new Map<string, string>();
    for (const t of existing) cache.set(`${t.messageId}::${t.targetLang}`, t.translatedText);

    // translate anything missing
    const jobs: Promise<void>[] = [];
    for (const m of ordered) {
      for (const lang of langs) {
        const key = `${m.id}::${lang}`;
        if (cache.has(key)) continue;
        const src = m.sourceLang;
        if (src.toLowerCase().split("-")[0] === lang.toLowerCase().split("-")[0]) {
          cache.set(key, m.originalText);
          continue;
        }
        jobs.push(
          (async () => {
            try {
              const { text } = await translateText(m.originalText, m.sourceLang, lang);
              cache.set(key, text);
              await db
                .insert(translations)
                .values({ messageId: m.id, targetLang: lang, translatedText: text });
            } catch {
              cache.set(key, m.originalText);
            }
          })()
        );
      }
    }
    // run in small batches to avoid hammering providers
    const BATCH = 4;
    for (let i = 0; i < jobs.length; i += BATCH) {
      await Promise.all(jobs.slice(i, i + BATCH));
    }

    return NextResponse.json({
      ok: true,
      messages: ordered.map((m) => {
        const t: Record<string, string> = {};
        for (const lang of langs) t[lang] = cache.get(`${m.id}::${lang}`) ?? m.originalText;
        return {
          id: m.id,
          originalText: m.originalText,
          sourceLang: m.sourceLang,
          speakerName: m.speakerName,
          createdAt: m.createdAt,
          translations: t,
        };
      }),
    });
  } catch (e) {
    console.error("messages GET failed", e);
    return NextResponse.json({ ok: false, error: "Could not load messages" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  try {
    const room = await findRoom(code);
    if (!room) return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text ?? "").trim().slice(0, 2000);
    if (!text) return NextResponse.json({ ok: false, error: "Empty message" }, { status: 400 });
    const sourceLang = String(body?.sourceLang ?? room.sourceLang).slice(0, 12) || room.sourceLang;
    const speakerName = String(body?.speakerName ?? "Speaker").slice(0, 80).trim() || "Speaker";

    const inserted = await db
      .insert(messages)
      .values({ roomId: room.id, originalText: text, sourceLang, speakerName })
      .returning();

    // clear live line if it matches this speaker's final text
    try {
      await db
        .update(rooms)
        .set({ liveText: null, liveSpeaker: null, liveSourceLang: null, liveUpdatedAt: new Date() })
        .where(eq(rooms.id, room.id));
    } catch {
      /* ignore */
    }

    const m = inserted[0];
    return NextResponse.json({
      ok: true,
      message: {
        id: m.id,
        originalText: m.originalText,
        sourceLang: m.sourceLang,
        speakerName: m.speakerName,
        createdAt: m.createdAt,
      },
    });
  } catch (e) {
    console.error("messages POST failed", e);
    return NextResponse.json({ ok: false, error: "Could not send message" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  try {
    const room = await findRoom(code);
    if (!room) return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });
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
    return NextResponse.json({ ok: true, cleared: ids.length });
  } catch (e) {
    console.error("clear failed", e);
    return NextResponse.json({ ok: false, error: "Could not clear" }, { status: 500 });
  }
}
