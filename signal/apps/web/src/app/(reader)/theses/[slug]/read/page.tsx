import type { Metadata } from "next";
import { ThesisSlugDetailPage } from "@/components/thesis-engine-v2/ThesisSlugDetailPage";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return { title: "DEPTH4 · Thesis (reader)" };
}

/** Clean share / reader view — `/theses/[slug]/read` */
export default function ThesisReaderRoutePage() {
  return <ThesisSlugDetailPage readerMode />;
}
