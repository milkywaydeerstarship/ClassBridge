import { NextRequest, NextResponse } from "next/server";
import { translateText } from "@/lib/translate-server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text ?? "").slice(0, 2000);
    const source = String(body?.source ?? "en").slice(0, 12) || "en";
    const target = String(body?.target ?? "es").slice(0, 12) || "es";
    if (!text.trim()) return NextResponse.json({ ok: true, translated: "" });
    const { text: translated, engine } = await translateText(text, source, target);
    return NextResponse.json({ ok: true, translated, engine });
  } catch (e) {
    console.error("translate failed", e);
    return NextResponse.json({ ok: false, error: "Translate failed" }, { status: 500 });
  }
}
