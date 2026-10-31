"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES } from "@/lib/languages";
import { LanguageChips, LanguageSelect } from "@/components/LanguageChips";

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-violet-600 shadow-[0_8px_30px_rgba(34,211,238,0.4)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
          <path d="M4 10v4h3l4 4V6l-4 4H4z" fill="white" stroke="none" opacity="0.95" />
          <path d="M15 9a4 4 0 0 1 0 6" />
          <path d="M17.5 6.5a8 8 0 0 1 0 11" opacity="0.7" />
        </svg>
      </div>
      <div className="leading-tight">
        <p className="font-[Sora] text-lg font-bold tracking-tight text-white">ClassBridge</p>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-300/80">Live translation for school</p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "join">("create");

  // create state
  const [roomName, setRoomName] = useState("");
  const [hostName, setHostName] = useState("");
  const [speakLang, setSpeakLang] = useState("en");
  const [listenLangs, setListenLangs] = useState<string[]>(["es"]);
  const [pin, setPin] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  // join state
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinLangs, setJoinLangs] = useState<string[]>(["en"]);
  const [joinPin, setJoinPin] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinErr, setJoinErr] = useState("");

  const saveSession = (code: string, session: object) => {
    try {
      localStorage.setItem(`classbridge:${code}`, JSON.stringify(session));
    } catch { /* ignore */ }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateErr("");
    setCreating(true);
    try {
      const displayName = hostName.trim() || "Host";
      // Always include the host's own speaking language so listener replies translate back to it.
      const mergedLangs = Array.from(new Set([...(listenLangs.length ? listenLangs : [speakLang]), speakLang]));
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: roomName.trim() || `${displayName}'s room`,
          sourceLang: speakLang,
          pin: pin.trim() || null,
          displayName,
          langs: mergedLangs.join(","),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not create room");
      saveSession(data.code, {
        displayName,
        langs: mergedLangs,
        speakLang,
        pin: pin.trim(),
        joinedAt: Date.now(),
      });
      router.push(`/room/${data.code}`);
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinErr("");
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setJoinErr("Enter the 6-character room code.");
      return;
    }
    setJoining(true);
    try {
      const displayName = joinName.trim() || "Guest";
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          langs: joinLangs.length ? joinLangs.join(",") : "en",
          pin: joinPin.trim(),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not join room");
      // Guests write/speak in their own first chosen language — it auto-translates
      // into everyone else's languages (including English for the host).
      const myLangs = joinLangs.length ? joinLangs : ["en"];
      saveSession(code, {
        displayName,
        langs: myLangs,
        speakLang: myLangs[0] ?? data.room?.sourceLang ?? "en",
        pin: joinPin.trim(),
        joinedAt: Date.now(),
      });
      router.push(`/room/${code}`);
    } catch (err) {
      setJoinErr(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.22),transparent)] blur-2xl" />
        <div className="absolute -left-40 top-1/3 h-[480px] w-[480px] rounded-full bg-[radial-gradient(closest-side,rgba(139,92,246,0.20),transparent)] blur-2xl" />
        <div className="absolute -right-40 bottom-0 h-[480px] w-[480px] rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.16),transparent)] blur-2xl" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse 90% 70% at 50% 20%, black 30%, transparent 75%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <header className="flex items-center justify-between py-6">
          <Logo />
          <div className="hidden items-center gap-5 text-sm text-slate-300 sm:flex">
            <a href="#how" className="transition hover:text-white">How it works</a>
            <a href="#languages" className="transition hover:text-white">Languages</a>
            <button
              onClick={() => setTab("create")}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-100"
            >
              Open a room
            </button>
          </div>
        </header>

        {/* hero */}
        <div className="grid items-start gap-10 pt-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pt-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200">
              <span className="live-dot inline-block h-2 w-2 rounded-full bg-emerald-400" />
              LIVE SPEECH TRANSLATION · BUILT FOR CLASSROOMS
            </div>
            <h1
              className="mt-5 font-[Sora] text-[clamp(2.4rem,5.5vw,4rem)] font-extrabold leading-[1.02] tracking-tight text-white"
            >
              Speak once.
              <br />
              <span className="animated-gradient bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 bg-clip-text text-transparent">
                Everyone hears their language.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-300 sm:text-base">
              Open a code-protected class room, speak or type from your device, and every student
              follows along in the language <em className="text-white not-italic font-semibold">they</em> choose —
              with live captions, voice readout, and a shared translated transcript.
            </p>

            <div className="mt-7 grid max-w-xl grid-cols-3 gap-3">
              {[
                { n: "30", l: "languages" },
                { n: "<2s", l: "speech → captions" },
                { n: "∞", l: "listeners per room" },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center">
                  <p className="font-[Sora] text-2xl font-bold text-white">{s.n}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{s.l}</p>
                </div>
              ))}
            </div>

            {/* live demo strip */}
            <div className="mt-6 max-w-xl space-y-2">
              {[
                { flag: "EN", who: "You · English", text: "Welcome everyone, let's get started with today's lesson.", c: "border-cyan-300/20 bg-cyan-400/[0.07]" },
                { flag: "ES", who: "María · Español", text: "Bienvenidos a todos, empecemos con la lección de hoy.", c: "border-violet-300/20 bg-violet-400/[0.07]" },
                { flag: "JA", who: "Yuki · 日本語", text: "ようこそ、本日の授業を始めましょう。", c: "border-emerald-300/20 bg-emerald-400/[0.07]" },
              ].map((d) => (
                <div key={d.flag} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${d.c}`}>
                  <span className="mt-0.5 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white">{d.flag}</span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{d.who}</p>
                    <p className="text-sm text-slate-100">{d.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* auth card */}
          <div className="glass rise-in rounded-3xl border border-white/10 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.5)] sm:p-7">
            <div className="grid grid-cols-2 rounded-2xl bg-white/5 p-1 text-sm font-semibold">
              {(["create", "join"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-xl px-4 py-2.5 transition ${
                    tab === t ? "bg-white text-slate-900 shadow" : "text-slate-300 hover:text-white"
                  }`}
                >
                  {t === "create" ? "Create room" : "Join room"}
                </button>
              ))}
            </div>

            {tab === "create" ? (
              <form onSubmit={handleCreate} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Room name</label>
                  <input
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g. 7th Grade History"
                    className="w-full rounded-xl border border-white/10 bg-[#0d1426] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-400/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Your name</label>
                    <input
                      value={hostName}
                      onChange={(e) => setHostName(e.target.value)}
                      placeholder="e.g. Alex"
                      className="w-full rounded-xl border border-white/10 bg-[#0d1426] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-400/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Room PIN (optional)</label>
                    <input
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/[^0-9a-zA-Z]/g, "").slice(0, 8))}
                      placeholder="4+ chars"
                      className="w-full rounded-xl border border-white/10 bg-[#0d1426] px-3.5 py-2.5 text-sm tracking-widest text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-400/20"
                    />
                  </div>
                </div>
                <LanguageSelect value={speakLang} onChange={setSpeakLang} label="You will speak in" />
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    You want to read in <span className="text-cyan-300">(pick up to 3 — listener replies translate back to you)</span>
                  </p>
                  <LanguageChips value={listenLangs} onChange={setListenLangs} max={3} />
                </div>
                {createErr ? (
                  <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{createErr}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_36px_rgba(34,211,238,0.35)] transition hover:brightness-110 disabled:opacity-60"
                >
                  {creating ? "Creating room…" : "Create protected room →"}
                </button>
                <p className="text-center text-xs text-slate-500">You get a 6-character code to share. No signup needed.</p>
              </form>
            ) : (
              <form onSubmit={handleJoin} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Room code</label>
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                    placeholder="e.g. KQ7M2P"
                    className="w-full rounded-xl border border-white/10 bg-[#0d1426] px-3.5 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em] text-white placeholder:text-slate-600 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-400/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Your name</label>
                    <input
                      value={joinName}
                      onChange={(e) => setJoinName(e.target.value)}
                      placeholder="e.g. María"
                      className="w-full rounded-xl border border-white/10 bg-[#0d1426] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-400/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">PIN (if required)</label>
                    <input
                      value={joinPin}
                      onChange={(e) => setJoinPin(e.target.value.slice(0, 12))}
                      placeholder="••••"
                      className="w-full rounded-xl border border-white/10 bg-[#0d1426] px-3.5 py-2.5 text-sm tracking-widest text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-400/20"
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Translate everything into <span className="text-cyan-300">(up to 3)</span>
                  </p>
                  <LanguageChips value={joinLangs} onChange={setJoinLangs} max={3} />
                </div>
                {joinErr ? (
                  <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{joinErr}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={joining}
                  className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-900 shadow transition hover:bg-cyan-100 disabled:opacity-60"
                >
                  {joining ? "Joining…" : "Join room →"}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* how */}
        <section id="how" className="mt-20">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">How it works</p>
              <h2 className="mt-2 font-[Sora] text-2xl font-bold text-white sm:text-3xl">One teacher, every language</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { t: "1 · Create a code-protected class room", d: "Name your room, pick the language you'll teach in, and optionally lock it with a PIN. Share the 6-character code with your students.", icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" },
              { t: "2 · Speak or type from your device", d: "Tap the mic and talk — live captions broadcast as you speak. Or just type. Every line is stored as a translated transcript.", icon: "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" },
              { t: "3 · Guests each pick their language — and can reply", d: "Everyone joining chooses 1–3 languages and follows along in their own tongue, live. Listeners can also type or speak back in their language — you'll read it in yours.", icon: "M3 5h12M9 3v2c1.5 2.5 4 4.5 7 5.5M5 8c1 2.5 3.5 4.5 6.5 5.5M13 21l4-9 4 9m-6.5-3h5" },
            ].map((s) => (
              <div key={s.t} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400/30 to-violet-500/30">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a5f3fc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={s.icon} /></svg>
                </div>
                <p className="mt-4 font-semibold text-white">{s.t}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* languages */}
        <section id="languages" className="mt-16 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Coverage</p>
              <h2 className="mt-2 font-[Sora] text-2xl font-bold text-white">30 languages, one room, zero confusion</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Mix and match freely — a Spanish speaker, a Japanese speaker and an Arabic speaker can all
                follow the same lesson at the same time, each in their own language.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <span key={l.code} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
                {l.label}
              </span>
            ))}
          </div>
          <div className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
            {[
              "Live captions while someone is speaking",
              "Voice readout in your chosen language",
              "Exportable translated transcript",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2.5 rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] px-4 py-3 text-emerald-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                {f}
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-slate-500">
          <p>ClassBridge — built for teachers, students, and every multilingual classroom.</p>
          <p>Tip: use Chrome or Edge for the best microphone experience.</p>
        </footer>
      </div>
    </div>
  );
}
