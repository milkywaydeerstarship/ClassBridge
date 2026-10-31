"use client";

import { LANGUAGES } from "@/lib/languages";

export function LanguageChips({
  value,
  onChange,
  max = 3,
  compact = false,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
  compact?: boolean;
}) {
  const toggle = (code: string) => {
    if (value.includes(code)) {
      onChange(value.filter((v) => v !== code));
    } else {
      if (value.length >= max) {
        onChange([...value.slice(1), code]);
      } else {
        onChange([...value, code]);
      }
    }
  };

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "max-h-44 overflow-y-auto scroll-slim pr-1"}`}>
      {LANGUAGES.map((l) => {
        const active = value.includes(l.code);
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => toggle(l.code)}
            title={l.label}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
              active
                ? "border-cyan-300/70 bg-cyan-400/15 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.25)]"
                : "border-white/10 bg-white/5 text-slate-300 hover:border-white/25 hover:text-white"
            } ${compact ? "px-2 py-0.5 text-[11px]" : ""}`}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

export function LanguageSelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </span>
      ) : null}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-[#0d1426] px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-400/20"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} className="bg-[#0d1426]">
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
