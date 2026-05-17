import type { Metadata } from "next";
import { loadThesisShareSnapshot } from "@/lib/thesis-engine-v2/load-thesis-share-snapshot";
import {
  THESIS_OG_IMAGE_HEIGHT,
  THESIS_OG_IMAGE_WIDTH,
  thesisReaderCanonicalUrl,
  thesisReaderOgImageUrl,
} from "@/lib/thesis-engine-v2/thesis-share-metadata";

/** Build Next.js metadata for `/theses/[slug]/read` (Phase 4B). */
export async function buildThesisReaderPageMetadata(slug: string): Promise<Metadata> {
  const snap = await loadThesisShareSnapshot(slug);
  const canonical = thesisReaderCanonicalUrl(snap.slug);
  const ogImage = thesisReaderOgImageUrl(snap.slug);
  const pageTitle = `${snap.ogTitle} · DEPTH4`;

  return {
    title: pageTitle,
    description: snap.description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      siteName: "DEPTH4",
      title: snap.ogTitle,
      description: snap.description,
      images: [
        {
          url: ogImage,
          width: THESIS_OG_IMAGE_WIDTH,
          height: THESIS_OG_IMAGE_HEIGHT,
          alt: `${snap.ogTitle} — DEPTH4 macro thesis`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: snap.ogTitle,
      description: snap.description,
      images: [ogImage],
    },
  };
}
