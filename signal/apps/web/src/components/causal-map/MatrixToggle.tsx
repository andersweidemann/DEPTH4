"use client";

import { useMemo, useState } from "react";
import { ChevronDown, LayoutGrid } from "lucide-react";
import { CausalMatrix } from "@/components/causal-matrix/CausalMatrix";
import { buildMatrixFromThesis } from "@/lib/causal-matrix/build-matrix";
import type { CausalEvent, CausalThesis } from "@/types/causal-graph";
import { cn } from "@/lib/utils";

export function MatrixToggle({ thesis, rootEvent }: { thesis: CausalThesis; rootEvent: CausalEvent }) {
  const [showMatrix, setShowMatrix] = useState(false);
  const matrix = useMemo(() => buildMatrixFromThesis(thesis, rootEvent), [thesis, rootEvent]);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setShowMatrix((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-zinc-500 transition-colors hover:text-[#E8473F]"
      >
        <LayoutGrid className="h-3 w-3" aria-hidden />
        {showMatrix ? "Hide 4×4 matrix" : "Show 4×4 matrix"}
        <ChevronDown className={cn("h-3 w-3 transition-transform", showMatrix && "rotate-180")} />
      </button>

      {showMatrix ? (
        <div className="mt-2 overflow-x-auto">
          <CausalMatrix matrix={matrix} variant="compact" />
        </div>
      ) : null}
    </div>
  );
}
