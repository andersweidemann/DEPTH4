"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type DiscoveryLabel = "featured" | "exemplar" | "curated" | "ai_generated" | "";

const LABEL_OPTIONS: { value: DiscoveryLabel; label: string }[] = [
  { value: "", label: "No label" },
  { value: "featured", label: "Featured" },
  { value: "exemplar", label: "Exemplar" },
  { value: "curated", label: "Curated" },
  { value: "ai_generated", label: "AI-generated" },
];

export function ThesisReaderDiscoveryControls({
  slug,
  publicEnabled,
  className,
}: {
  slug: string;
  /** Parent share control must be public before discoverability can be enabled. */
  publicEnabled: boolean;
  className?: string;
}) {
  const [canManage, setCanManage] = useState(false);
  const [discoverable, setDiscoverable] = useState(false);
  const [label, setLabel] = useState<DiscoveryLabel>("");
  const [priority, setPriority] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/theses/${encodeURIComponent(slug)}/reader-discovery`);
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        canManage?: boolean;
        discoverable?: boolean;
        label?: string | null;
        priority?: number;
      } | null;
      if (!res.ok || !j?.ok) {
        setCanManage(false);
        return;
      }
      setCanManage(j.canManage === true);
      setDiscoverable(j.discoverable === true);
      setLabel((j.label as DiscoveryLabel) ?? "");
      setPriority(typeof j.priority === "number" ? j.priority : 0);
    } catch {
      setError("Could not load discovery settings.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load, publicEnabled]);

  const save = useCallback(
    async (patch: { discoverable: boolean; label?: DiscoveryLabel; priority?: number }) => {
      if (!canManage || saving) return;
      setSaving(true);
      setError(null);
      try {
        const res = await authFetch(`/api/theses/${encodeURIComponent(slug)}/reader-discovery`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            discoverable: patch.discoverable,
            label: patch.label === "" ? null : patch.label,
            priority: patch.priority,
          }),
        });
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        if (res.status === 400 && j?.error === "requires_public_link") {
          setError("Enable the public reader link before listing on discovery.");
          return;
        }
        if (res.status === 403) {
          setError("You do not have permission to change discovery settings.");
          return;
        }
        if (!res.ok) {
          setError("Could not update discovery settings.");
          return;
        }
        await load();
      } catch {
        setError("Could not update discovery settings.");
      } finally {
        setSaving(false);
      }
    },
    [canManage, load, saving, slug],
  );

  if (loading || !canManage) return null;

  return (
    <section
      className={cn("rounded-lg border border-white/[0.06] bg-zinc-900/20 px-4 py-4", className)}
      aria-label="Public discovery settings"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Public discovery</p>
      <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
        Listed theses appear on{" "}
        <a href="/public-theses" className="text-zinc-400 underline hover:text-[#E8473F]">
          /public-theses
        </a>
        . Link sharing alone does not list a thesis here.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving || !publicEnabled}
          onClick={() => void save({ discoverable: !discoverable, label, priority })}
          className={cn(
            "rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors",
            discoverable
              ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200"
              : "border-[#E8473F]/40 bg-[#E8473F]/10 text-[#E8473F]",
            !publicEnabled && "cursor-not-allowed opacity-50",
          )}
        >
          {saving ? "Saving…" : discoverable ? "Remove from discovery" : "List on discovery"}
        </button>
      </div>

      {discoverable ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-[11px] text-zinc-500">
            Label
            <select
              value={label}
              disabled={saving}
              onChange={(e) => {
                const next = e.target.value as DiscoveryLabel;
                setLabel(next);
                void save({ discoverable: true, label: next, priority });
              }}
              className="mt-1 block rounded border border-white/[0.08] bg-[#1a1a19] px-2 py-1.5 text-[12px] text-zinc-200"
            >
              {LABEL_OPTIONS.map((o) => (
                <option key={o.value || "none"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-zinc-500">
            Priority
            <input
              type="number"
              min={0}
              max={999}
              value={priority}
              disabled={saving}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
              onBlur={() => void save({ discoverable: true, label, priority })}
              className="mt-1 block w-20 rounded border border-white/[0.08] bg-[#1a1a19] px-2 py-1.5 text-[12px] tabular-nums text-zinc-200"
            />
          </label>
          <p className="text-[10px] text-zinc-600">Higher priority sorts first within the same label tier.</p>
        </div>
      ) : null}

      {!publicEnabled ? (
        <p className="mt-2 text-[11px] text-zinc-600">Enable the public reader link first.</p>
      ) : null}

      {error ? <p className="mt-2 text-[11px] text-red-400/90">{error}</p> : null}
    </section>
  );
}
