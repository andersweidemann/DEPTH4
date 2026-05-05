import type { ReactNode } from "react";
import "@/styles/thesis-engine-v2.css";

/**
 * Layout shell for DEPTH4 2.0 prototype routes only.
 * Does not wrap /dashboard or other 1.0 pages.
 */
export default function Depth4V2Layout({ children }: { children: ReactNode }) {
  return (
    <div className="te2 min-h-screen bg-[#0c0c0e] text-zinc-100 antialiased selection:bg-amber-500/20 selection:text-amber-100">
      {children}
    </div>
  );
}
