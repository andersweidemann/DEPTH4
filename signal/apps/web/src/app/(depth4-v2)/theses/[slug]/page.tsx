import type { Metadata } from "next";
import { ThesisDetailClient } from "@/components/thesis-engine-v2/ThesisDetailClient";

type Props = { params: { slug: string } };

export function generateMetadata(): Metadata {
  // User-created theses are stored client-side, so keep metadata generic.
  return { title: "Thesis · DEPTH4" };
}

export default function ThesisDetailPage({ params }: Props) {
  return <ThesisDetailClient slug={params.slug} />;
}
