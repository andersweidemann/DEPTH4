import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DEPTH4 · Community",
  description: "Published theses from the DEPTH4 community.",
};

export default function CommunityPage() {
  return (
    <div className="py-20 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Community</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-50">Community feed</h1>
      <p className="mt-3 text-[13px] text-zinc-400">Not live yet.</p>
      <p className="mt-1 max-w-md mx-auto text-[12px] text-zinc-500">
        When it launches, this is where published theses and community activity will appear.
      </p>
    </div>
  );
}
