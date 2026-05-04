"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Prefs = {
  web_desktop?: boolean;
  min_signal_level?: number;
};

export function NotificationSettings({ className }: { className?: string }) {
  const sb = createClient();
  const [ready, sReady] = useState(false);
  const [perm, sPerm] = useState<NotificationPermission>("default");
  const [prefs, sPrefs] = useState<Prefs>({ min_signal_level: 3, web_desktop: false });
  const [saving, sSave] = useState(false);
  const [err, sErr] = useState("");

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { data } = await sb.from("users").select("notification_preferences").eq("id", user.id).single();
    const raw = (data as { notification_preferences?: unknown } | null)?.notification_preferences;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      sPrefs((v) => ({ ...v, ...(raw as Prefs) }));
    }
    if (typeof Notification !== "undefined") sPerm(Notification.permission);
    sReady(true);
  }, [sb]);

  useEffect(() => { void load(); }, [load]);

  async function save(next: Prefs) {
    sSave(true);
    sErr("");
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      sSave(false);
      return;
    }
    const merged = { ...prefs, ...next, last_updated: new Date().toISOString() };
    const { error } = await sb.from("users").update({ notification_preferences: merged }).eq("id", user.id);
    if (error) sErr(error.message);
    else sPrefs((v) => ({ ...v, ...next }));
    sSave(false);
  }

  async function enableBrowser() {
    if (typeof Notification === "undefined") {
      sErr("Notifications not supported in this browser.");
      return;
    }
    const p = await Notification.requestPermission();
    sPerm(p);
    if (p === "granted") await save({ web_desktop: true });
  }

  if (!ready) return <div className={cn("text-xs text-zinc-500", className)}>Loading…</div>;

  return (
    <div className={cn("rounded-lg border border-zinc-700/60 bg-zinc-900/50 p-3", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Alerts (optional)</p>
      <p className="text-xs text-zinc-500 mt-1">Get desktop notices when we flag high-signal events. You can turn this off anytime.</p>
      {err && <p className="text-xs text-rose-400 mt-1">{err}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {perm === "granted" && prefs.web_desktop ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="bg-zinc-800 text-zinc-200 border-zinc-600"
            onClick={() => void save({ web_desktop: false })}
            disabled={saving}
          >
            <BellOff className="h-3.5 w-3.5 mr-1" />
            Mute in-browser
          </Button>
        ) : (
          <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-500" onClick={() => void enableBrowser()} disabled={saving}>
            <Bell className="h-3.5 w-3.5 mr-1" />
            Allow desktop notifications
          </Button>
        )}
        <span className="text-[10px] text-zinc-500">Depth 3+ events, opt-in. Mobile push = roadmap.</span>
      </div>
    </div>
  );
}
