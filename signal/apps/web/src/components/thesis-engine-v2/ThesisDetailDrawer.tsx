"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThesisDetailClient } from "@/components/thesis-engine-v2/ThesisDetailClient";
import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import { getUserThesisBySlug } from "@/lib/thesis-engine-v2/user-theses";
import { formatThesisMicroLabel, getThesisDisplayTitle } from "@/lib/thesis-engine-v2/thesis-display-title";

const TRANSITION_MS = 300;

/**
 * Desktop: right-side detail panel with subtle dim; mobile: full-width panel.
 * ESC and backdrop close; scroll stays on dashboard (no route change).
 */
export function ThesisDetailDrawer({
  slug,
  catalogDisplayTitle,
  catalogMicroLabel,
  catalogBody,
  onClose,
}: {
  slug: string | null;
  /** Merged `Thesis.title` from dashboard (Supabase-backed when signed in). */
  catalogDisplayTitle?: string | null;
  /** Merged `Thesis.microLabel` from dashboard. */
  catalogMicroLabel?: string | null;
  /** Optional `public.theses.body` for catalog narrative merge in the drawer. */
  catalogBody?: unknown | null;
  onClose: () => void;
}) {
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const panelOpen = entered && !leaving;

  const requestClose = useCallback(() => {
    setLeaving(true);
  }, []);

  useEffect(() => {
    if (!slug) {
      setEntered(false);
      setLeaving(false);
      return;
    }
    setLeaving(false);
    setEntered(false);
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [slug]);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => {
      onClose();
      setLeaving(false);
      setEntered(false);
    }, TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [leaving, onClose]);

  useEffect(() => {
    if (!slug) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slug, requestClose]);

  useEffect(() => {
    if (!slug) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [slug]);

  useEffect(() => {
    if (!slug || !panelOpen) return;
    closeBtnRef.current?.focus();
  }, [slug, panelOpen]);

  if (!slug) return null;

  const drawerTitle = (() => {
    const fromParent = catalogDisplayTitle?.trim();
    if (fromParent) return fromParent;
    const sys = getThesisDetail(slug);
    if (sys) return getThesisDisplayTitle(sys.thesis);
    const ut = getUserThesisBySlug(slug);
    if (ut) return getThesisDisplayTitle(ut);
    return slug.replace(/-/g, " ");
  })();

  const drawerMicro =
    formatThesisMicroLabel(catalogMicroLabel) ??
    formatThesisMicroLabel(getThesisDetail(slug)?.thesis.microLabel) ??
    formatThesisMicroLabel(getUserThesisBySlug(slug)?.microLabel);

  return (
    <div className="fixed inset-0 z-[85] flex justify-end" role="dialog" aria-modal="true" aria-label="Thesis detail">
      <button
        type="button"
        className={cn(
          "absolute inset-0 bg-black/[0.22] transition-opacity duration-300 motion-reduce:transition-none",
          panelOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        aria-label="Close drawer"
        onClick={requestClose}
      />

      <aside
        className={cn(
          "relative z-[1] flex h-dvh max-h-dvh w-full flex-col bg-[#131316] sm:w-[min(48vw,40rem)] sm:max-w-none",
          "transition-transform duration-300 ease-out motion-reduce:transition-none",
          panelOpen ? "translate-x-0" : "translate-x-full",
        )}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 bg-[#151518] px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1 pr-2">
            {drawerMicro ? (
              <p className="truncate text-[10px] font-medium leading-snug text-zinc-500" title={drawerMicro}>
                {drawerMicro}
              </p>
            ) : null}
            <p
              className={cn("truncate text-[12px] font-semibold leading-snug text-zinc-100", drawerMicro ? "mt-0.5" : "")}
              title={drawerTitle}
            >
              {drawerTitle}
            </p>
            <Link
              href={`/theses/${slug}`}
              className="mt-1 inline-block text-[10px] font-semibold text-amber-200/90 underline-offset-2 hover:text-amber-100 hover:underline"
            >
              Open full page →
            </Link>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-900/60 hover:text-zinc-200"
            aria-label="Close"
            onClick={requestClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="h-px w-full bg-white/[0.06]" aria-hidden />

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          <ThesisDetailClient
            slug={slug}
            layout="drawer"
            onClose={requestClose}
            catalogDisplayTitle={catalogDisplayTitle}
            catalogMicroLabel={catalogMicroLabel}
            catalogBody={catalogBody}
          />
        </div>
      </aside>
    </div>
  );
}
