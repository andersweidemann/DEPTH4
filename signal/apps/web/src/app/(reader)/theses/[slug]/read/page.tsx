import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThesisSlugDetailPage } from "@/components/thesis-engine-v2/ThesisSlugDetailPage";
import { ThesisReaderView } from "@/components/thesis-engine-v2/ThesisReaderView";
import { ReaderAuthGate, PrivateThesisReaderLoginPrompt } from "@/components/thesis-engine-v2/ReaderAuthGate";
import { buildThesisReaderPageMetadata } from "@/lib/thesis-engine-v2/thesis-reader-metadata";
import { isThesisReaderPublic, loadPublicThesisReaderBundle } from "@/lib/thesis-engine-v2/thesis-reader-public";
import { recordPublicReaderView } from "@/lib/thesis-engine-v2/thesis-reader-analytics/record";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = params.slug?.trim() ?? "";
  if (!slug) return { title: "DEPTH4 · Thesis" };
  return buildThesisReaderPageMetadata(slug);
}

/** Clean share / reader view — `/theses/[slug]/read` */
export default async function ThesisReaderRoutePage({ params }: Props) {
  const slug = params.slug?.trim() ?? "";
  if (!slug) notFound();

  const isPublic = await isThesisReaderPublic(slug);

  if (isPublic) {
    const bundle = await loadPublicThesisReaderBundle(slug);
    if (!bundle) notFound();

    void recordPublicReaderView({
      thesisId: bundle.thesis.id,
      slug,
      eventSource: "server_render",
    });

    return (
      <ThesisReaderView
        slug={slug}
        thesis={bundle.thesis}
        relatedAssets={bundle.relatedAssets}
        publicMode
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <PrivateThesisReaderLoginPrompt slug={slug} />;
  }

  return (
    <ReaderAuthGate>
      <ThesisSlugDetailPage readerMode />
    </ReaderAuthGate>
  );
}
