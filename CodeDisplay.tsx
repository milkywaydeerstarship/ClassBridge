"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Full-screen "projector" view of the class code (Google Classroom style).
 * Giant code, the join link, and a QR code students can scan from their seats.
 */
export function CodeDisplay({
  code,
  roomName,
  inviteLink,
  hasPin,
  onClose,
}: {
  code: string;
  roomName: string;
  inviteLink: string;
  hasPin: boolean;
  onClose: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Build the QR code for the invite link
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(inviteLink, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0b1020", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteLink]);

  // Esc closes, and lock page scroll while open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const host = (() => {
    try {
      return new URL(inviteLink).host;
    } catch {
      return inviteLink;
    }
  })();

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-[#070b16] text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Class code display"
      onClick={onClose}
    >
      {/* soft backdrop glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[70vh] w-[70vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.18),transparent)] blur-3xl" />
      </div>

      {/* top bar */}
      <div
        className="relative flex items-center justify-between px-5 py-4 sm:px-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300/80">Join this class</p>
          <p className="truncate font-[Sora] text-lg font-bold sm:text-xl">{roomName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="hidden rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:text-white sm:block"
          >
            {copied ? "Link copied ✓" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:text-white"
            title="Close (Esc)"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* main content */}
      <div
        className="relative flex flex-1 flex-col items-center justify-center gap-8 px-5 pb-10 lg:flex-row lg:gap-16"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Class code</p>
          <p
            className="mt-2 select-all font-mono font-bold leading-none tracking-[0.18em] text-white"
            style={{ fontSize: "clamp(3.5rem, 17vw, 13rem)" }}
          >
            {code}
          </p>
          <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Go to</p>
            <p className="mt-1 break-all font-semibold text-cyan-200" style={{ fontSize: "clamp(1.1rem, 2.6vw, 2rem)" }}>
              {host}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              tap <span className="font-semibold text-slate-200">Join room</span> and type the code
              {hasPin ? (
                <>
                  {" "}— <span className="font-semibold text-amber-200">this class needs the PIN too</span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="rounded-3xl bg-white p-3 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                alt={`QR code to join room ${code}`}
                className="block h-auto"
                style={{ width: "clamp(160px, 28vw, 340px)" }}
              />
            ) : (
              <div className="grid place-items-center bg-slate-100 text-slate-500" style={{ width: "clamp(160px, 28vw, 340px)", aspectRatio: "1 / 1" }}>
                …
              </div>
            )}
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-300">Or scan with your phone camera</p>
          <p className="text-xs text-slate-500">opens the join page with the code already filled in</p>
        </div>
      </div>

      <p className="relative pb-4 text-center text-xs text-slate-500">
        Press <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-slate-300">Esc</kbd> or tap outside to close
      </p>
    </div>
  );
}
