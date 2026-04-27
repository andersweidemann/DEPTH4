"use client";
import type { Tree } from "@/app/dashboard/types";
import type { FeedViewModel } from "@/lib/feed-model";

function boldFromMarkdown(w: string) {
  const parts = w.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return w;
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function impactClass(s: string) {
  if (s.startsWith("−") || s.startsWith("-") || s.toLowerCase().includes("down")) return "d4-down";
  if (s.startsWith("+") && !s.includes("TBD") && !s.includes("narrative")) return "d4-up";
  return "";
}

export function Depth4L4Panel({
  headline,
  vm,
  aTree,
}: {
  headline: string | null;
  vm: FeedViewModel | null;
  aTree: Tree | null;
}) {
  const l4 = vm?.layer4;
  return (
    <>
      <div className="d4-rp-sec">
        <div className="d4-rp-kicker">Layer 4 — for you</div>
        {headline && <p className="d4-bubble-meta" style={{ marginBottom: 8, color: "var(--d4-text)", fontSize: 12 }}>{headline}</p>}
        {l4 && l4.isPersonalized === false && (
          <p className="d4-dm-signal" style={{ marginBottom: 10, fontSize: 11, fontWeight: 400, background: "var(--d4-goldbg)" }}>
            Add positions for personalized P&amp;L. Below: event context only.
          </p>
        )}
        {l4 && l4.positions.length > 0 ? (
          <div className="d4-table-wrap">
            <table className="d4-table" role="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Value</th>
                  <th>If A</th>
                  <th>If C</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {l4.positions.map((r) => (
                  <tr key={r.position}>
                    <td>{r.position}</td>
                    <td>{r.valueSek}</td>
                    <td className={impactClass(r.impactScenarioA)}>{r.impactScenarioA}</td>
                    <td className={impactClass(r.impactScenarioC)}>{r.impactScenarioC}</td>
                    <td>{r.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="d4-bubble-meta" style={{ fontSize: 12 }}>No position rows in scope (no overlap or no quotes).</p>
        )}

        {l4 && l4.orders.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="d4-dm-kicker" style={{ color: "var(--d4-faint)", marginBottom: 6 }}>Open orders</div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {l4.orders.map((o) => (
                <li
                  key={o.summary}
                  className="d4-dm-block"
                  style={{ fontSize: 12, color: "var(--d4-muted)" }}
                >
                  <p style={{ color: "var(--d4-text)", fontWeight: 600, margin: "0 0 4px" }}>{o.summary}</p>
                  <p className="d4-bubble-meta" style={{ margin: 0 }}>{o.distanceLine}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {l4 && l4.watchlist.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="d4-dm-kicker" style={{ color: "var(--d4-faint)" }}>Watch (not in book)</div>
            <ol className="d4-prose-brief" style={{ color: "var(--d4-text)", fontSize: 12, paddingLeft: 18, margin: "6px 0 0" }}>
              {l4.watchlist.map((w, i) => (
                <li key={i} style={{ margin: "4px 0" }}>{boldFromMarkdown(w.line)}</li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div className="d4-rp-sec">
        <div className="d4-rp-kicker">Watch signals (tree)</div>
        {aTree?.watch_signals && Array.isArray(aTree.watch_signals) && aTree.watch_signals.length > 0 ? (
          <div>
            {aTree.watch_signals.map((w) => (
              <div className="d4-sig" key={w}>
                <span className="d4-sdot d4-sdot--y" aria-hidden />
                <span>{w}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="d4-bubble-meta" style={{ fontSize: 12 }}>No watch signals for this run.</p>
        )}
      </div>

      <p className="d4-disclaimer" style={{ margin: 0 }}>
        Not financial advice. Machine context only — use your own process. DEPTH4 dashboard.
      </p>
    </>
  );
}
