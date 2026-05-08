import type { ReactNode } from "react";
import "@/styles/thesis-engine-v2.css";
import { Depth4V2Shell } from "@/components/thesis-engine-v2/Depth4V2Shell";

/** Layout shell for DEPTH4 thesis workspace routes. */
export default function Depth4V2Layout({ children }: { children: ReactNode }) {
  return (
    <div className="te2 min-h-screen bg-[#0c0c0e] text-zinc-100 antialiased selection:bg-amber-500/20 selection:text-amber-100">
      <Depth4V2Shell>{children}</Depth4V2Shell>
    </div>
  );
}
