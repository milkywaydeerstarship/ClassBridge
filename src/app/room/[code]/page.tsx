"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LANGUAGES, langByCode } from "@/lib/languages";
import { LanguageChips } from "@/components/LanguageChips";

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

type Msg = {
  id: string;
  originalText: string;
  sourceLang: string;
  speakerName: string;
  createdAt: string;
  translations: Record<string, string>;
};
type LiveState = { text: string; sourceLang: string; speaker: string; updatedAt: string } | null;
type Participant = {
  id: string;
  name: string;
  participantKey: string | null;
  langs: string;
  isMuted: boolean;
  isHost: boolean;
};

type Session = {
  displayName: string;
  langs: string[];
  speakLang: string;
  pin: string;
  isHost?: boolean;
  hostSecret?: string;
  participantKey?: string;
};

const bcp47 = (code: string) => (code === "auto" ? "en-US" : langByCode(code).bcp47);
const sourceLabel = (code: string) => (code === "auto" ? "Auto-detect" : langByCode(code).label);

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const s = Math.max(1, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleString();
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = useMemo(() => String(params?.code ?? "").toUpperCase().trim(), [params]);

  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [roomInfo, setRoomInfo] = useState<{
    name: string;
    sourceLang: string;
    hasPin: boolean;
    isClosed?: boolean;
  } | null>(null);
  const [roomMissing, setRoomMissing] = useState(false);

  // Status indicators
  const [isRoomClosed, setIsRoomClosed] = useState(false);
  const [isKicked, setIsKicked] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Gate form
  const [gateName, setGateName] = useState("");
  const [gateLangs, setGateLangs] = useState<string[]>(["en"]);
  const [gatePin, setGatePin] = useState("");
  const [gateErr, setGateErr] = useState("");
  const [gateBusy, setGateBusy] = useState(false);

  // Messages & Live Captions
  const [messages, setMessages] = useState<Msg[]>([]);
  const [live, setLive] = useState<LiveState>(null);
  const [liveTranslations, setLiveTranslations] = useState<Record<string, string>>({});
  const [translatingLive, setTranslatingLive] = useState(false);

  // Language & identity preferences
  const [myLangs, setMyLangs] = useState<string[]>(["en"]);
  const [primaryLang, setPrimaryLang] = useState("en");
  const [speakLang, setSpeakLang] = useState("en");
  const [displayName, setDisplayName] = useState("Student");

  // Presence & Student Management
  const [presence, setPresence] = useState<{
    count: number;
    people: Participant[];
    distribution: Record<string, number>;
  }>({ count: 0, people: [], distribution: {} });

  const [compose, setCompose] = useState("");
  const [sending, setSending] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [showOriginal, setShowOriginal] = useState(true);
  const [connected, setConnected] = useState(true);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Microphone
  const [listening, setListening] = useState(false);
  const [micSupported] = useState(
    () => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState("");
  const recogRef = useRef<SpeechRecognitionInstance | null>(null);
  const wantListening = useRef(false);
  const lastLivePost = useRef(0);

  const feedRef = useRef<HTMLDivElement>(null);
  const spokenIds = useRef<Set<string>>(new Set());
  const langsKey = useMemo(() => [...myLangs].sort().join(","), [myLangs]);

  const isHost = Boolean(session?.isHost && session?.hostSecret);

  // Load session from storage
  useEffect(() => {
    try {
      const raw =
        localStorage.getItem(`classroombridge:${code}`) ??
        localStorage.getItem(`classbridge:${code}`) ??
        localStorage.getItem(`linguaclass:${code}`);
      if (raw) {
        const s = JSON.parse(raw) as Session;
        if (s?.displayName) {
          setSession(s);
          setDisplayName(s.displayName);
          setMyLangs(s.langs?.length ? s.langs.slice(0, 3) : ["en"]);
          setPrimaryLang(s.langs?.[0] ?? "en");
          setSpeakLang(s.speakLang ?? "en");
        }
      }
    } catch { /* ignore */ }
    setSessionLoaded(true);
  }, [code]);

  const persistSession = useCallback(
    (patch: Partial<Session>) => {
      setSession((prev) => {
        const next = { ...(prev ?? { displayName, langs: myLangs, speakLang, pin: "" }), ...patch } as Session;
        try {
          localStorage.setItem(`classroombridge:${code}`, JSON.stringify({ ...next, joinedAt: Date.now() }));
        } catch { /* ignore */ }
        return next;
      });
    },
    [code, displayName, myLangs, speakLang]
  );

  // Load room info
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
        const data = await res.json();
        if (!cancelled) {
          if (data.ok) {
            setRoomInfo(data.room);
            if (data.room.isClosed) setIsRoomClosed(true);
            setConnected(true);
          } else {
            setRoomMissing(true);
          }
        }
      } catch {
        if (!cancelled) setConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (roomInfo && !session) setSpeakLang(roomInfo.sourceLang);
  }, [roomInfo, session]);

  // Messages polling
  const fetchMessages = useCallback(async () => {
    if (!code || !sessionLoaded || !session || isKicked) return;
    try {
      const res = await fetch(
        `/api/rooms/${encodeURIComponent(code)}/messages?langs=${encodeURIComponent(langsKey)}&limit=80`
      );
      const data = await res.json();
      if (data.ok) {
        setMessages(data.messages);
        if (data.isClosed) setIsRoomClosed(true);
        setConnected(true);
      }
    } catch {
      setConnected(false);
    }
  }, [code, langsKey, sessionLoaded, session, isKicked]);

  useEffect(() => {
    fetchMessages();
    const t = setInterval(fetchMessages, 2500);
    return () => clearInterval(t);
  }, [fetchMessages]);

  // Live polling
  useEffect(() => {
    if (!code || !session || isKicked) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/live`);
        const data = await res.json();
        if (!cancelled && data.ok) {
          setLive(data.live);
          if (data.isClosed) setIsRoomClosed(true);
        }
      } catch { /* ignore */ }
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [code, session, isKicked]);

  // Live translation
  useEffect(() => {
    if (!live?.text) {
      setLiveTranslations({});
      return;
    }
    setTranslatingLive(true);
    const t = setTimeout(async () => {
      try {
        const entries = await Promise.all(
          myLangs.map(async (lang) => {
            try {
              const res = await fetch("/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: live.text, source: live.sourceLang, target: lang }),
              });
              const data = await res.json();
              return [lang, data.translated ?? live.text] as const;
            } catch {
              return [lang, live.text] as const;
            }
          })
        );
        setLiveTranslations(Object.fromEntries(entries));
      } finally {
        setTranslatingLive(false);
      }
    }, 550);
    return () => clearTimeout(t);
  }, [live?.text, live?.sourceLang, myLangs]);

  // Presence heartbeat & status sync
  const heartbeat = useCallback(async () => {
    if (!code || !session || isKicked) return;
    try {
      const pKey = session.participantKey;
      const postRes = await fetch(`/api/rooms/${encodeURIComponent(code)}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          langs: myLangs.join(",") || "en",
          participantKey: pKey,
          isHost,
        }),
      });
      const postData = await postRes.json();
      if (postData.ok) {
        if (postData.isKicked) setIsKicked(true);
        if (postData.isMuted !== undefined) setIsMuted(Boolean(postData.isMuted));
        if (postData.isClosed !== undefined) setIsRoomClosed(Boolean(postData.isClosed));
      }

      const res = await fetch(
        `/api/rooms/${encodeURIComponent(code)}/presence?participantKey=${encodeURIComponent(pKey || "")}`
      );
      const data = await res.json();
      if (data.ok) {
        setPresence({ count: data.count, people: data.people, distribution: data.distribution });
        if (data.myStatus?.isKicked) setIsKicked(true);
        if (data.myStatus?.isMuted !== undefined) setIsMuted(Boolean(data.myStatus.isMuted));
        if (data.isClosed !== undefined) setIsRoomClosed(Boolean(data.isClosed));
      }
    } catch { /* ignore */ }
  }, [code, session, displayName, myLangs, isHost, isKicked]);

  useEffect(() => {
    heartbeat();
    const t = setInterval(heartbeat, 10000);
    return () => clearInterval(t);
  }, [heartbeat]);

  // Autoscroll
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, live?.text]);

  // TTS Readout
  const speak = useCallback((text: string, langCode: string) => {
    try {
      if (!("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = bcp47(langCode);
      u.rate = 1;
      const voices = synth.getVoices();
      const match =
        voices.find((v) => v.lang.toLowerCase().startsWith(langCode.split("-")[0].toLowerCase())) ??
        voices.find((v) => v.lang.toLowerCase().startsWith(u.lang.toLowerCase().slice(0, 2)));
      if (match) u.voice = match;
      synth.speak(u);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  useEffect(() => {
    if (!autoSpeak || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (spokenIds.current.has(last.id)) return;
    spokenIds.current.add(last.id);
    const text = last.translations[primaryLang] ?? last.originalText;
    if (text) speak(text, primaryLang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, autoSpeak, primaryLang]);

  // Send message
  const sendMessage = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || !session) return;
      if (isMuted) {
        alert("You have been muted by the teacher and cannot send messages.");
        return;
      }
      if (isRoomClosed) {
        alert("This room is closed.");
        return;
      }

      setSending(true);
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: clean.slice(0, 2000),
            sourceLang: speakLang,
            speakerName: displayName,
            participantKey: session.participantKey,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          alert(data.error || "Could not send message.");
          return;
        }
        setCompose("");
        setInterim("");
        try {
          await fetch(`/api/rooms/${encodeURIComponent(code)}/live`, { method: "DELETE" });
        } catch { /* ignore */ }
        fetchMessages();
      } finally {
        setSending(false);
      }
    },
    [code, session, isMuted, isRoomClosed, speakLang, displayName, fetchMessages]
  );

  const postLive = useCallback(
    async (text: string) => {
      if (isMuted || isRoomClosed) return;
      const now = Date.now();
      if (now - lastLivePost.current < 900) return;
      lastLivePost.current = now;
      try {
        await fetch(`/api/rooms/${encodeURIComponent(code)}/live`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.slice(0, 600),
            sourceLang: speakLang,
            speaker: displayName,
            participantKey: session?.participantKey,
          }),
        });
      } catch { /* ignore */ }
    },
    [code, isMuted, isRoomClosed, speakLang, displayName, session?.participantKey]
  );

  // Microphone
  const stopMic = useCallback(async () => {
    wantListening.current = false;
    setListening(false);
    try {
      recogRef.current?.stop();
    } catch { /* ignore */ }
    recogRef.current = null;
    setInterim("");
    try {
      await fetch(`/api/rooms/${encodeURIComponent(code)}/live`, { method: "DELETE" });
    } catch { /* ignore */ }
  }, [code]);

  const startMic = useCallback(() => {
    if (isMuted) {
      alert("You have been muted by the teacher.");
      return;
    }
    if (isRoomClosed) {
      alert("This room is closed.");
      return;
    }
    setMicError("");
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setMicError(
        "Microphone speech recognition isn't supported in this browser. Try Chrome or Edge — or type instead."
      );
      return;
    }
    try {
      recogRef.current?.abort();
    } catch { /* ignore */ }
    const recog = new Ctor();
    recog.lang = speakLang === "auto" ? bcp47(primaryLang) : bcp47(speakLang);
    recog.continuous = true;
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    wantListening.current = true;

    recog.onresult = (ev: SpeechRecognitionEventLike) => {
      let interimText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const transcript = r[0]?.transcript ?? "";
        if (r.isFinal) {
          const finalText = transcript.trim();
          if (finalText) void sendMessage(finalText);
        } else {
          interimText += transcript;
        }
      }
      const trimmed = interimText.trim();
      setInterim(trimmed);
      if (trimmed) void postLive(trimmed);
    };
    recog.onerror = (ev) => {
      const err = ev?.error ?? "";
      if (err === "not-allowed" || err === "service-not-allowed") {
        setMicError("Microphone blocked. Allow mic access in the browser, then try again.");
        wantListening.current = false;
        setListening(false);
      }
    };
    recog.onend = () => {
      if (wantListening.current) {
        try {
          recog.start();
        } catch { /* ignore */ }
      } else {
        setListening(false);
      }
    };
    try {
      recog.start();
      recogRef.current = recog;
      setListening(true);
    } catch {
      setMicError("Could not start the microphone. Please try again.");
    }
  }, [isMuted, isRoomClosed, speakLang, primaryLang, sendMessage, postLive]);

  useEffect(
    () => () => {
      wantListening.current = false;
      try {
        recogRef.current?.abort();
      } catch { /* ignore */ }
    },
    []
  );

  // Gate Join Form
  const handleGateJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateErr("");
    const name = gateName.trim();
    if (!name) {
      setGateErr("Your name is required to join this classroom.");
      return;
    }
    setGateBusy(true);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name, langs: gateLangs.join(",") || "en", pin: gatePin }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not join");

      const myGateLangs = gateLangs.length ? gateLangs : ["en"];
      const s: Session = {
        displayName: name,
        langs: myGateLangs,
        speakLang: myGateLangs[0] ?? data.room?.sourceLang ?? "en",
        pin: gatePin,
        isHost: false,
        participantKey: data.participantKey,
      };
      try {
        localStorage.setItem(`classroombridge:${code}`, JSON.stringify(s));
      } catch { /* ignore */ }
      setSession(s);
      setDisplayName(s.displayName);
      setMyLangs(s.langs);
      setPrimaryLang(s.langs[0]);
      setSpeakLang(s.speakLang);
    } catch (err) {
      setGateErr(err instanceof Error ? err.message : "Could not join");
    } finally {
      setGateBusy(false);
    }
  };

  const handleMyLangs = (langs: string[]) => {
    const next = langs.length ? langs.slice(0, 3) : [primaryLang];
    setMyLangs(next);
    if (!next.includes(primaryLang)) setPrimaryLang(next[0]);
    persistSession({ langs: next });
  };

  const copyText = async (t: string, label: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setActionNotice(`Copied ${label}!`);
      setTimeout(() => setActionNotice(null), 2500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setActionNotice(`Copied ${label}!`);
      setTimeout(() => setActionNotice(null), 2500);
    }
  };

  const exportTranscript = () => {
    const lines: string[] = [
      `${roomInfo?.name ?? "Classroom Bridge"} — room ${code}`,
      `Exported ${new Date().toLocaleString()}`,
      `Languages: ${myLangs.join(", ")}`,
      "",
    ];
    for (const m of messages) {
      lines.push(
        `[${new Date(m.createdAt).toLocaleTimeString()}] ${m.speakerName} (${m.sourceLang}): ${m.originalText}`
      );
      for (const l of myLangs) {
        const t = m.translations[l];
        if (t && t !== m.originalText) lines.push(`  → [${l}] ${t}`);
      }
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `classroom-bridge-${code}-transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Teacher Moderation Actions
  const runAdminAction = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!session?.hostSecret) {
      alert("Only the teacher who created this room has moderation controls.");
      return;
    }
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostSecret: session.hostSecret,
          action,
          ...payload,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || "Action failed.");
        return;
      }
      if (action === "close_room") {
        setIsRoomClosed(true);
        setActionNotice("Room closed and all students kicked out.");
      } else if (action === "reopen_room") {
        setIsRoomClosed(false);
        setActionNotice("Room reopened.");
      } else if (action === "clear_transcript") {
        setMessages([]);
        setActionNotice("Transcript cleared for everyone.");
      } else if (data.message) {
        setActionNotice(data.message);
      }
      setTimeout(() => setActionNotice(null), 3000);
      heartbeat();
    } catch {
      alert("Failed to perform moderation action.");
    }
  };

  const inviteLink = typeof window !== "undefined" ? `${window.location.origin}/room/${code}` : `/room/${code}`;
  const distMax = Math.max(1, ...Object.values(presence.distribution));

  if (roomMissing) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <p className="font-mono text-4xl font-bold text-white">{code}</p>
          <p className="mt-3 text-lg font-semibold text-white">This classroom doesn't exist</p>
          <p className="mt-1 text-sm text-slate-400">Check the 6-character room code and try again.</p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 w-full rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-900"
          >
            Back home
          </button>
        </div>
      </div>
    );
  }

  // Student Kicked Screen
  if (isKicked) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="max-w-md rounded-3xl border border-rose-500/30 bg-rose-500/10 p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/20 text-rose-300">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h2 className="mt-4 font-[Sora] text-2xl font-bold text-white">Removed from Room</h2>
          <p className="mt-2 text-sm text-rose-200">
            You have been removed from this classroom session by the teacher.
          </p>
          <button
            onClick={() => {
              try {
                localStorage.removeItem(`classroombridge:${code}`);
                localStorage.removeItem(`classbridge:${code}`);
              } catch { /* ignore */ }
              router.push("/");
            }}
            className="mt-6 w-full rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-900"
          >
            Return to Homepage
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.16),transparent)] blur-2xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        {/* Notification Toast */}
        {actionNotice && (
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 rounded-2xl border border-cyan-400/40 bg-slate-900/95 px-5 py-2.5 text-xs font-semibold text-cyan-200 shadow-2xl backdrop-blur-md">
            {actionNotice}
          </div>
        )}

        {/* Room Header */}
        <header className="flex flex-wrap items-center gap-3 py-5">
          <button
            onClick={() => router.push("/")}
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:text-white"
            title="Leave classroom"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5m7-7l-7 7 7 7" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-[Sora] text-lg font-bold text-white">
                {roomInfo?.name ?? "Loading room…"}
              </h1>
              {isRoomClosed ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-2.5 py-1 text-[11px] font-bold text-rose-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  CLOSED
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    connected ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400 live-dot" : "bg-amber-400"}`} />
                  {connected ? "LIVE" : "RETRYING"}
                </span>
              )}

              {isHost && (
                <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-200">
                  TEACHER / HOST
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <button
                onClick={() => void copyText(code, "code")}
                className="rounded-lg bg-white/5 px-2 py-1 font-mono text-sm font-bold tracking-[0.25em] text-white transition hover:bg-white/10"
                title="Copy code"
              >
                {code}
              </button>
              <span>·</span>
              <span>{presence.count} in room</span>
              <span>·</span>
              <span>{messages.length} lines</span>
              <span>·</span>
              <span>room: {roomInfo ? sourceLabel(roomInfo.sourceLang) : "…"}</span>
              <span>·</span>
              <span>you write in: {speakLang === "auto" ? "Auto-detect" : langByCode(speakLang).label}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void copyText(inviteLink, "link")}
              className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs font-semibold text-slate-200 transition hover:text-white"
            >
              Copy invite link
            </button>
            <button
              onClick={exportTranscript}
              className="hidden rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs font-semibold text-slate-200 transition hover:text-white sm:block"
            >
              Export transcript
            </button>
          </div>
        </header>

        {/* Closed Room Banner */}
        {isRoomClosed && (
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-rose-500/30 bg-rose-500/15 p-4 text-rose-200">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-rose-500/20 text-rose-300">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-bold text-white">This classroom has been closed by the teacher.</p>
                <p className="text-xs text-rose-200">New messages and live voice broadcasts are disabled.</p>
              </div>
            </div>
            {isHost && (
              <button
                onClick={() => runAdminAction("reopen_room")}
                className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-900 transition hover:bg-slate-100"
              >
                Reopen Room
              </button>
            )}
          </div>
        )}

        {/* Student Mute Warning */}
        {isMuted && !isHost && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            </svg>
            <span>You have been muted by the teacher. You can still listen and read translated messages.</span>
          </div>
        )}

        {/* Gate Overlay: Require Name */}
        {sessionLoaded && !session ? (
          <div className="mx-auto mt-6 max-w-lg rounded-3xl border border-white/10 bg-[#0d1426]/90 p-7 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Join classroom session</p>
            <h2 className="mt-2 font-[Sora] text-2xl font-bold text-white">{roomInfo?.name ?? `Room ${code}`}</h2>
            <p className="mt-1 text-sm text-slate-400">
              Please enter your full name and choose the languages you want everything translated into.
            </p>
            <form onSubmit={handleGateJoin} className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Your name <span className="text-cyan-300">*</span>
                  </label>
                  <input
                    required
                    value={gateName}
                    onChange={(e) => setGateName(e.target.value)}
                    placeholder="e.g. María García"
                    className="w-full rounded-xl border border-white/10 bg-[#070b16] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/60"
                  />
                </div>
                {roomInfo?.hasPin ? (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Room PIN
                    </label>
                    <input
                      value={gatePin}
                      onChange={(e) => setGatePin(e.target.value)}
                      placeholder="Required"
                      className="w-full rounded-xl border border-white/10 bg-[#070b16] px-3 py-2.5 text-sm tracking-widest text-white outline-none focus:border-cyan-300/60"
                    />
                  </div>
                ) : null}
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Translate everything into <span className="text-cyan-300">(up to 3)</span>
                </p>
                <LanguageChips value={gateLangs} onChange={setGateLangs} max={3} />
              </div>
              {gateErr ? <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{gateErr}</p> : null}
              <button
                disabled={gateBusy}
                className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:brightness-110 disabled:opacity-60"
              >
                {gateBusy ? "Joining…" : "Enter room →"}
              </button>
            </form>
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
            {/* Main Translation Column */}
            <div className="min-w-0">
              {/* Live Speaker Banner */}
              {live?.text ? (
                <div className="rise-in mb-3 overflow-hidden rounded-3xl border border-cyan-300/25 bg-gradient-to-br from-cyan-400/[0.12] to-violet-500/[0.10] p-5">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200">
                    <span className="live-dot h-2 w-2 rounded-full bg-rose-400" />
                    {live.speaker} is speaking…
                    {translatingLive ? <span className="text-slate-400">· translating</span> : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{live.text}</p>
                  <div className="mt-3 space-y-2">
                    {myLangs.map((l) => (
                      <div key={l} className="rounded-2xl bg-black/30 px-4 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/80">
                          {langByCode(l).label}
                        </p>
                        <p className="text-[15px] font-medium leading-snug text-white">{liveTranslations[l] ?? "…"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Local Mic Interim Transcription */}
              {listening && interim ? (
                <div className="mb-3 rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">You are saying…</p>
                  <p className="mt-1 text-[15px] text-slate-100">{interim}</p>
                </div>
              ) : null}

              {/* Translation Message Feed */}
              <div
                ref={feedRef}
                className="scroll-slim h-[52vh] min-h-[340px] space-y-3 overflow-y-auto rounded-3xl border border-white/10 bg-black/20 p-3 sm:p-4 lg:h-[56vh]"
              >
                {messages.length === 0 ? (
                  <div className="grid h-full place-items-center p-8 text-center">
                    <div>
                      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/5">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#67e8f9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 12h8m-8 4h5M21 12a9 9 0 11-4-7.5" />
                        </svg>
                      </div>
                      <p className="mt-4 font-semibold text-white">Class session ready</p>
                      <p className="mx-auto mt-1 max-w-xs text-sm text-slate-400">
                        Tap the microphone and speak{micSupported ? "" : " (or type below)"} — profanity is filtered automatically and every student follows in their language.
                      </p>
                    </div>
                  </div>
                ) : (
                  messages.map((m) => {
                    const primary = m.translations[primaryLang] ?? m.originalText;
                    const others = myLangs.filter((l) => l !== primaryLang);
                    return (
                      <div key={m.id} className="rise-in rounded-2xl border border-white/[0.07] bg-white/[0.04] px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400/40 to-violet-500/40 text-xs font-bold text-white">
                            {(m.speakerName || "?").slice(0, 1).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-200">
                              {m.speakerName} <span className="font-normal text-slate-500">· {timeAgo(m.createdAt)}</span>
                            </p>
                            <p className="text-[10px] uppercase tracking-widest text-slate-500">
                              from {sourceLabel(m.sourceLang)}
                            </p>
                          </div>
                          <button
                            onClick={() => speak(primary, primaryLang)}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:text-white"
                            title={`Read aloud in ${langByCode(primaryLang).label}`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 5L6 9H2v6h4l5 4V5z" />
                              <path d="M15.5 8.5a5 5 0 010 7" />
                            </svg>
                          </button>
                        </div>
                        <p className="mt-2.5 text-[17px] font-medium leading-snug text-white">{primary}</p>
                        {others.map((l) => (
                          <p key={l} className="mt-1.5 border-l-2 border-white/10 pl-2.5 text-sm text-slate-300">
                            <span className="mr-1.5 rounded bg-white/10 px-1 py-0.5 text-[10px] font-bold text-slate-200">
                              {langByCode(l).short}
                            </span>
                            {m.translations[l] ?? m.originalText}
                          </p>
                        ))}
                        {showOriginal && primary !== m.originalText ? (
                          <p className="mt-2 text-xs italic leading-relaxed text-slate-500">Original: {m.originalText}</p>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Composer */}
              <div className="mt-3 rounded-3xl border border-white/10 bg-[#0d1426]/90 p-3 sm:p-4">
                {micError ? <p className="mb-2 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-200">{micError}</p> : null}
                <div className="flex items-end gap-2.5">
                  <button
                    disabled={isMuted || isRoomClosed}
                    onClick={() => (listening ? void stopMic() : startMic())}
                    title={
                      isMuted
                        ? "You are muted"
                        : isRoomClosed
                        ? "Room is closed"
                        : listening
                        ? "Stop microphone"
                        : "Speak from this device"
                    }
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition disabled:opacity-30 ${
                      listening
                        ? "bg-gradient-to-br from-rose-500 to-orange-500 shadow-[0_0_28px_rgba(244,63,94,0.5)]"
                        : "bg-gradient-to-br from-cyan-400 to-sky-600 shadow-[0_8px_28px_rgba(34,211,238,0.35)] hover:brightness-110"
                    }`}
                  >
                    {listening ? (
                      <span className="flex items-end gap-[3px]">
                        {[0, 1, 2, 3].map((i) => (
                          <span
                            key={i}
                            className="mic-bar w-[3px] rounded-full bg-white"
                            style={{ height: 18, animationDelay: `${i * 0.15}s` }}
                          />
                        ))}
                      </span>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#04121f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <textarea
                      disabled={isMuted || isRoomClosed}
                      value={compose}
                      onChange={(e) => setCompose(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void sendMessage(compose);
                        }
                      }}
                      rows={2}
                      placeholder={
                        isRoomClosed
                          ? "This room is closed by the teacher."
                          : isMuted
                          ? "You are muted by the teacher."
                          : listening
                          ? "Listening… speak freely, it translates & filters automatically."
                          : "Type in your language or tap mic — profanity is filtered automatically…"
                      }
                      className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-300/50 disabled:opacity-50"
                    />
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">I write in:</span>
                      <select
                        disabled={isMuted || isRoomClosed}
                        value={speakLang}
                        onChange={(e) => {
                          setSpeakLang(e.target.value);
                          persistSession({ speakLang: e.target.value });
                        }}
                        className="rounded-lg border border-cyan-300/25 bg-black/30 px-2 py-1 text-xs font-semibold text-cyan-100 outline-none"
                      >
                        <option value="auto" className="bg-[#0d1426]">Auto-detect</option>
                        {LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code} className="bg-[#0d1426]">
                            {l.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setSpeakLang(primaryLang);
                          persistSession({ speakLang: primaryLang });
                        }}
                        className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-slate-300 transition hover:text-white"
                      >
                        Use my {langByCode(primaryLang).short}
                      </button>
                      <span className="text-[11px] text-slate-500">
                        {isMuted ? "Muted" : listening ? "Mic live" : "Mic ready"} · as <b className="text-slate-300">{displayName}</b>
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => void sendMessage(compose)}
                    disabled={sending || !compose.trim() || isMuted || isRoomClosed}
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-slate-900 transition hover:bg-cyan-100 disabled:opacity-30"
                    title="Send"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Sidebar: Teacher Moderation, Languages & Participants */}
            <aside className="space-y-3">
              {/* Teacher Moderation Panel (Only visible to the Host) */}
              {isHost && (
                <div className="rounded-3xl border border-violet-500/30 bg-violet-500/[0.08] p-5 shadow-xl">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">
                      Teacher Controls
                    </p>
                    <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-200">
                      Host Admin
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {/* Close Room & Kick Everyone */}
                    {!isRoomClosed ? (
                      <button
                        onClick={() => {
                          if (confirm("Close this room and kick all students out?")) {
                            runAdminAction("close_room");
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-500/20 border border-rose-500/40 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/30 transition"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="15" y1="9" x2="9" y2="15" />
                          <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                        Close Room & Kick All
                      </button>
                    ) : (
                      <button
                        onClick={() => runAdminAction("reopen_room")}
                        className="w-full rounded-xl bg-emerald-500/20 border border-emerald-500/40 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30 transition"
                      >
                        Reopen Room
                      </button>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => runAdminAction("mute_all")}
                        className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition"
                      >
                        Mute All Students
                      </button>
                      <button
                        onClick={() => runAdminAction("unmute_all")}
                        className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition"
                      >
                        Unmute All
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        if (confirm("Clear the full transcript for everyone in the room?")) {
                          runAdminAction("clear_transcript");
                        }
                      }}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] font-semibold text-slate-400 hover:text-rose-300 transition"
                    >
                      Clear Transcript
                    </button>
                  </div>
                </div>
              )}

              {/* Connected Students List with Individual Mute & Kick buttons */}
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Class Members</p>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-white">
                    {presence.count}
                  </span>
                </div>

                <div className="mt-3 max-h-56 overflow-y-auto scroll-slim space-y-2">
                  {presence.people.length > 0 ? (
                    presence.people.map((p) => {
                      const isMe = p.participantKey === session?.participantKey;
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2 text-xs"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <p className="truncate font-medium text-white flex items-center gap-1.5">
                              {p.name}
                              {p.isHost && (
                                <span className="rounded bg-violet-400/20 px-1 py-0.2 text-[9px] font-bold text-violet-300">
                                  Teacher
                                </span>
                              )}
                              {isMe && <span className="text-slate-400 text-[10px]">(You)</span>}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {p.langs.split(",").map((l) => langByCode(l).short).join(" · ")}
                              {p.isMuted && <span className="ml-1 text-amber-300 font-bold">· Muted</span>}
                            </p>
                          </div>

                          {/* Teacher can Mute or Kick this specific participant */}
                          {isHost && !p.isHost && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() =>
                                  runAdminAction("toggle_mute", {
                                    presenceId: p.id,
                                    participantKey: p.participantKey,
                                    isMuted: !p.isMuted,
                                  })
                                }
                                title={p.isMuted ? "Unmute this student" : "Mute this student"}
                                className={`rounded-lg px-2 py-1 text-[10px] font-semibold transition ${
                                  p.isMuted
                                    ? "bg-amber-400/20 text-amber-200 border border-amber-400/30"
                                    : "bg-white/5 text-slate-300 hover:bg-white/15 hover:text-white"
                                }`}
                              >
                                {p.isMuted ? "Unmute" : "Mute"}
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Kick ${p.name} out of this class session?`)) {
                                    runAdminAction("kick_participant", {
                                      presenceId: p.id,
                                      participantKey: p.participantKey,
                                    });
                                  }
                                }}
                                title="Kick student out"
                                className="rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 px-2 py-1 text-[10px] font-semibold border border-rose-500/20 transition"
                              >
                                Kick
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-slate-500">Waiting for students to join…</p>
                  )}
                </div>

                {/* Languages breakdown */}
                {Object.keys(presence.distribution).length > 0 && (
                  <div className="mt-4 border-t border-white/10 pt-3 space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Languages In Room</p>
                    {Object.entries(presence.distribution)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 6)
                      .map(([lang, n]) => (
                        <div key={lang} className="flex items-center gap-2 text-xs">
                          <span className="w-24 truncate text-slate-300">{langByCode(lang).label}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                              style={{ width: `${Math.round((n / distMax) * 100)}%` }}
                            />
                          </div>
                          <span className="w-5 text-right font-bold text-white">{n}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* My Language Preferences */}
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">I Read In</p>
                <div className="mt-3">
                  <LanguageChips value={myLangs} onChange={handleMyLangs} max={3} compact />
                </div>
                <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  Main Display + Audio Voice
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {myLangs.map((l) => (
                    <button
                      key={l}
                      onClick={() => setPrimaryLang(l)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        primaryLang === l ? "bg-white text-slate-900" : "bg-white/5 text-slate-300 hover:text-white"
                      }`}
                    >
                      {langByCode(l).label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Readout Controls */}
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Audio Readout</p>
                <div className="mt-3 space-y-2.5 text-sm">
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="text-slate-200">
                      Read new lines aloud{" "}
                      <span className="block text-xs font-normal text-slate-500">
                        in {langByCode(primaryLang).label}
                      </span>
                    </span>
                    <button
                      onClick={() => setAutoSpeak(!autoSpeak)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                        autoSpeak ? "bg-emerald-400" : "bg-white/15"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                          autoSpeak ? "left-[22px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="text-slate-200">Show original text</span>
                    <button
                      onClick={() => setShowOriginal(!showOriginal)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                        showOriginal ? "bg-cyan-400" : "bg-white/15"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                          showOriginal ? "left-[22px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </label>
                  <button
                    onClick={() =>
                      speak(
                        messages.length
                          ? messages[messages.length - 1].translations[primaryLang] ??
                              messages[messages.length - 1].originalText
                          : "Hello, this is Classroom Bridge.",
                        primaryLang
                      )
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:text-white"
                  >
                    Test audio voice
                  </button>
                </div>
              </div>

              {/* Share Room Card */}
              <div className="rounded-3xl border border-cyan-300/20 bg-cyan-400/[0.06] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200/80">Class Code</p>
                <p className="mt-2 text-center font-mono text-3xl font-bold tracking-[0.25em] text-white">{code}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => void copyText(code, "code")}
                    className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-900 transition hover:bg-slate-100"
                  >
                    Copy code
                  </button>
                  <button
                    onClick={() => void copyText(inviteLink, "link")}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/10"
                  >
                    Copy link
                  </button>
                </div>
                <p className="mt-2 text-center text-[11px] text-slate-400">
                  {roomInfo?.hasPin ? "PIN protected." : "No PIN required."}
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
