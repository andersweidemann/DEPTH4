import type { Metadata } from "next";
import { ThesisSlugAnatomyDebugPage } from "@/components/thesis-engine-v2/ThesisSlugAnatomyDebugPage";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return { title: "DEPTH4 · Thesis anatomy debug" };
}

export default function ThesisAnatomyDebugRoutePage() {
  return <ThesisSlugAnatomyDebugPage />;
}
