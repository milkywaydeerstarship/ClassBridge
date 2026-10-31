// Server-side translation engine.
// Primary: Google's free gtx endpoint (no key). Fallback: MyMemory (no key).
// Both are best-effort public endpoints; failures return the original text.

const GOOGLE_URL = "https://translate.googleapis.com/translate_a/single";

function normalize(code: string): string {
  if (!code) return "en";
  const c = code.trim();
  if (c.toLowerCase().startsWith("zh")) return "zh-CN";
  return c.split("-")[0].toLowerCase();
}

async function viaGoogle(text: string, source: string, target: string): Promise<string | null> {
  const sl = source === "auto" ? "auto" : normalize(source);
  const tl = normalize(target);
  if (sl === tl) return text;
  const url = `${GOOGLE_URL}?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(
    tl
  )}&dt=t&q=${encodeURIComponent(text)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    // shape: [[["translated","original",...],...],...]
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const sentences = data[0] as unknown[];
      const out = sentences
        .map((s) => (Array.isArray(s) && typeof s[0] === "string" ? (s[0] as string) : ""))
        .join("");
      if (out.trim().length > 0) return out;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function viaMyMemory(text: string, source: string, target: string): Promise<string | null> {
  const sl = normalize(source);
  const tl = target.toLowerCase().startsWith("zh") ? "zh-CN" : normalize(target);
  if (sl === tl) return text;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
    text
  )}&langpair=${encodeURIComponent(sl)}|${encodeURIComponent(tl)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number;
    };
    const out = data?.responseData?.translatedText;
    if (out && out.trim().length > 0 && !out.toUpperCase().includes("QUERY LENGTH LIMIT")) {
      return out;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function chunk(text: string, size = 450): string[] {
  if (text.length <= size) return [text];
  const parts: string[] = [];
  const sentences = text.split(/(?<=[.!?。！？\n])\s+/);
  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).length > size && cur) {
      parts.push(cur);
      cur = s;
    } else {
      cur = cur ? cur + " " + s : s;
    }
  }
  if (cur) parts.push(cur);
  // hard split any oversized chunk
  const final: string[] = [];
  for (const p of parts) {
    if (p.length <= size) final.push(p);
    else {
      for (let i = 0; i < p.length; i += size) final.push(p.slice(i, i + size));
    }
  }
  return final;
}

export async function translateText(
  text: string,
  source: string,
  target: string
): Promise<{ text: string; engine: string }> {
  const clean = (text ?? "").trim();
  if (!clean) return { text: "", engine: "none" };
  const sl = normalize(source);
  const tl = target.toLowerCase().startsWith("zh") ? "zh-CN" : normalize(target);
  if (sl === tl) return { text: clean, engine: "identity" };

  const parts = chunk(clean);
  const out: string[] = [];
  for (const part of parts) {
    const g = await viaGoogle(part, sl, tl);
    if (g) {
      out.push(g);
      continue;
    }
    const m = await viaMyMemory(part, sl, tl);
    if (m) {
      out.push(m);
      continue;
    }
    out.push(part);
  }
  const joined = out.join(" ");
  const engine = joined === clean ? "fallback" : "auto";
  return { text: joined, engine };
}
