import type { Metadata } from "next";
import { ThesisSlugDetailPage } from "@/components/thesis-engine-v2/ThesisSlugDetailPage";

/** Thesis detail uses live evidence polling + merged scenarios — do not cache the shell. */
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return { title: "DEPTH4 · Thesis" };
}

export default function ThesisDetailPage() {
  return <ThesisSlugDetailPage />;
}
