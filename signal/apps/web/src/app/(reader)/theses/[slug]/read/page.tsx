import type { Metadata } from "next";
import { ThesisSlugDetailPage } from "@/components/thesis-engine-v2/ThesisSlugDetailPage";
import { buildThesisReaderPageMetadata } from "@/lib/thesis-engine-v2/thesis-reader-metadata";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = params.slug?.trim() ?? "";
  if (!slug) {
    return { title: "DEPTH4 · Thesis" };
  }
  return buildThesisReaderPageMetadata(slug);
}

/** Clean share / reader view — `/theses/[slug]/read` */
export default function ThesisReaderRoutePage() {
  return <ThesisSlugDetailPage readerMode />;
}
