"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";

export function WaitlistCapture({ list }: { list: "community" | "leaderboard" }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    window.setTimeout(() => {
      setSubmitting(false);
      setEmail("");
      toast.success("Thanks — we'll be in touch when this launches.");
    }, 400);
    void list;
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
      <input
        type="email"
        name="email"
        autoComplete="email"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-64 max-w-full rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-2 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:border-[#E8473F]/30 focus:outline-none focus:ring-2 focus:ring-slate-400"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md border border-[#E8473F]/20 bg-[#E8473F]/10 px-4 py-2 text-[11px] font-medium text-[#E8473F] transition-colors hover:bg-[#E8473F]/20 disabled:opacity-50"
      >
        {submitting ? "Joining…" : "Join waitlist"}
      </button>
    </form>
  );
}
