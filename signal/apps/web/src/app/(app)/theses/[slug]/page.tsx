import type { Metadata } from "next";
import { ThesisDetailChunkPage } from "@/components/thesis-engine-v2/ThesisDetailChunkPage";

/** Thesis detail reads live APIs on the client — do not cache the shell. */
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return { title: "DEPTH4 · Thesis" };
}

export default function ThesisDetailPage() {
  return <ThesisDetailChunkPage />;
}
