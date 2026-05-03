"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardC, CardH } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { detectBrokerFromCsv, parseBrokerCsv, type BrokerImportSource } from "@signal/shared";
import { Building2, FileUp, ArrowRight } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function Onboarding() {
  const r = useRouter();
  const sb = createClient();
  const f = useRef<HTMLInputElement>(null);
  const [p, setP] = useState([{ t: "", q: "", a: "" }]);
  const [o, setO] = useState([{ t: "", dir: "buy" as "buy" | "sell", lp: "" }]);
  const [err, se] = useState("");
  const [saving, setSaving] = useState(false);
  const [prv, sprv] = useState<{ t: string; n: string; q: string }[] | null>(null);
  const [b, sbr] = useState<BrokerImportSource>("unknown");

  async function fin() {
    if (saving) return;
    setSaving(true);
    se("");
    try {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        r.push("/login");
        return;
      }

      const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
      const fullName =
        (typeof meta?.full_name === "string" && meta.full_name) ||
        (typeof meta?.name === "string" && meta.name) ||
        "";
      const { error: ensureUserErr } = await sb.from("users").upsert(
        { id: user.id, email: user.email ?? "", full_name: fullName },
        { onConflict: "id" },
      );
      if (ensureUserErr) {
        se(ensureUserErr.message);
        return;
      }
      if (prv) {
        const { count } = await sb.from("portfolio_positions").select("*", { count: "exact", head: true }).eq("user_id", user.id);
        if ((prv.length + (count ?? 0)) > 5) {
          const u = await sb.from("users").select("tier").eq("id", user.id).single();
          if ((u.data as { tier: string } | null)?.tier === "free") {
            se("Free plan allows 5 positions. Remove some or upgrade to Pro.");
            return;
          }
        }
        for (const m of prv) {
          if (!m.t) continue;
          const q = parseFloat(m.q) || 0;
          if (q === 0) continue;
          const { error } = await sb.from("portfolio_positions").insert({
            user_id: user.id,
            ticker: m.t.toUpperCase().slice(0, 20),
            company_name: m.n || null,
            quantity: q,
            currency: "SEK",
            manual_or_connected: "import" as const,
            avg_cost: 0,
          });
          if (error) se(error.message);
        }
      } else {
        const { count } = await sb.from("portfolio_positions").select("*", { count: "exact", head: true }).eq("user_id", user.id);
        if (p.filter((i) => i.t).length + (count ?? 0) > 5) {
          const u = await sb.from("users").select("tier").eq("id", user.id).single();
          if ((u.data as { tier: string } | null)?.tier === "free") {
            se("Free plan allows 5 positions. Remove some or upgrade to Pro.");
            return;
          }
        }
        for (const i of p) {
          if (!i.t) continue;
          const q = parseFloat(i.q) || 0,
            a = parseFloat(i.a) || 0;
          if (!q) continue;
          const { error } = await sb.from("portfolio_positions").insert({
            user_id: user.id,
            ticker: i.t.toUpperCase().slice(0, 16),
            quantity: q,
            avg_cost: a,
            currency: "SEK",
            manual_or_connected: "manual" as const,
          });
          if (error) se(error.message);
        }
      }
      for (const j of o) {
        if (!j.t) continue;
        const lp = parseFloat(j.lp);
        if (!j.lp) continue;
        const { error } = await sb.from("open_orders").insert({
          user_id: user.id,
          ticker: j.t.toUpperCase(),
          order_type: "limit",
          direction: j.dir,
          limit_price: lp,
          status: "active" as const,
        });
        if (error) se(error.message);
      }
      const { error: doneErr } = await sb
        .from("users")
        .update({ onboarding_complete: true } as object)
        .eq("id", user.id);
      if (doneErr) {
        se(doneErr.message);
        return;
      }
      r.replace("/dashboard");
    } catch (x) {
      se(x instanceof Error ? x.message : "Could not finish onboarding");
    } finally {
      setSaving(false);
    }
  }

  async function csvPicked() {
    const v = f.current?.files?.[0];
    if (!v) return;
    const x = await v.text();
    const first = x.split(/\r?\n/)[0] || "";
    const b2 = b === "unknown" ? detectBrokerFromCsv(first) : b;
    sbr(b2);
    const rows = parseBrokerCsv(x, b2);
    sprv(rows.map((r) => ({ t: r.ticker, n: r.companyName || "", q: String(r.quantity) })));
  }

  return (
    <div className="min-h-dvh p-4 max-w-3xl mx-auto space-y-4 pb-24">
      <h1 className="text-xl font-semibold">Set up your portfolio</h1>
      <p className="text-sm text-slate-600">DEPTH4 will weight news, scenarios, and orders against this book.</p>
      <div className="grid md:grid-cols-2 gap-3">
        <Card className="cursor-default">
          <CardH className="space-y-1">
            <span className="text-xs text-orange-600">Recommended</span>
            <div className="font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Manual entry
            </div>
          </CardH>
          <CardC>
            {p.map((row, i) => (
              <div className="grid grid-cols-3 gap-2 py-1" key={i}>
                <input placeholder="Ticker" className="border rounded p-1 text-sm" value={row.t} onChange={(c) => { const n = [...p]; n[i] = { ...n[i]!, t: c.target.value }; setP(n); }} />
                <input placeholder="Shares" className="border rounded p-1 text-sm" value={row.q} onChange={(c) => { const n = [...p]; n[i] = { ...n[i]!, q: c.target.value }; setP(n); }} />
                <input placeholder="Avg cost" className="border rounded p-1 text-sm" value={row.a} onChange={(c) => { const n = [...p]; n[i] = { ...n[i]!, a: c.target.value }; setP(n); }} />
              </div>
            ))}
            <Button variant="secondary" className="mt-2" type="button" onClick={() => setP([...p, { t: "", q: "", a: "" }])}>
              + Position
            </Button>
            <p className="pt-2 text-xs text-slate-500">Open limit orders (optional)</p>
            {o.map((row, i) => (
              <div className="grid grid-cols-3 gap-2 py-1" key={i}>
                <input placeholder="Ticker" className="border rounded p-1 text-sm" value={row.t} onChange={(c) => { const n = [...o]; n[i] = { ...n[i]!, t: c.target.value }; setO(n); }} />
                <select className="border rounded p-1 text-sm" value={row.dir} onChange={(c) => { const n = [...o]; n[i] = { ...n[i]!, dir: c.target.value as "buy" | "sell" }; setO(n); }}><option value="buy">Buy</option><option value="sell">Sell</option></select>
                <input placeholder="Limit" className="border rounded p-1 text-sm" value={row.lp} onChange={(c) => { const n = [...o]; n[i] = { ...n[i]!, lp: c.target.value }; setO(n); }} />
              </div>
            ))}
            <Button variant="secondary" className="mt-1" type="button" onClick={() => setO([...o, { t: "", dir: "buy", lp: "" }])}>
              + Order
            </Button>
            <p className="pt-1 text-xs text-slate-400">Yahoo search can be wired; quotes load on dashboard via {API}/market/quote</p>
          </CardC>
        </Card>
        <div className="space-y-3">
          <Card>
            <CardH className="font-medium flex items-center gap-2">
              <FileUp className="h-4 w-4" />
              CSV (Avanza / Nordnet)
            </CardH>
            <CardC>
              <input type="file" ref={f} accept=".csv" className="text-sm" onChange={csvPicked} />
              {prv && (
                <ul className="text-xs text-left max-h-40 overflow-auto space-y-1">
                  {prv.slice(0, 8).map((h, k) => (
                    <li key={k}>
                      {h.t} {h.n} — {h.q}
                    </li>
                  ))}
                </ul>
              )}
            </CardC>
          </Card>
          <Card>
            <CardH className="text-sm font-medium flex items-center justify-between">
              <span>Broker connect</span>
              <span className="text-[10px] rounded border border-orange-300 text-orange-800 bg-orange-50 px-1.5 py-0.5">Phase 2</span>
            </CardH>
            <CardC className="space-y-2 text-xs text-slate-500">
              {["Avanza", "Nordnet", "Interactive Brokers"].map((x) => (
                <div key={x} className="flex justify-between">
                  {x} <span className="text-orange-600">Coming soon</span>
                </div>
              ))}
            </CardC>
          </Card>
        </div>
      </div>
      <div className="flex flex-col gap-2 fixed bottom-0 left-0 right-0 p-3 bg-white/95 border-t border-slate-200 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        {err ? <p className="text-sm text-red-600 text-center sm:text-left">{err}</p> : null}
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => void fin()}
            disabled={saving}
            className="w-full sm:w-auto inline-flex items-center gap-1.5"
          >
            {saving ? (
              "Saving…"
            ) : (
              <>
                Save & go to feed
                <ArrowRight className="h-4 w-4 shrink-0" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
