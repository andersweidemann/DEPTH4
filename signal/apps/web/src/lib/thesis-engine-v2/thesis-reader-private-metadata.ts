import type { Metadata } from "next";
import { thesisReaderCanonicalUrl } from "@/lib/thesis-engine-v2/thesis-share-metadata";

/** Generic metadata when thesis reader is private — avoids leaking thesis copy to crawlers. */
export function buildPrivateThesisReaderMetadata(slug: string): Metadata {
  const canonical = thesisReaderCanonicalUrl(slug);
  return {
    title: "DEPTH4 · Macro thesis",
    description: "Sign in to DEPTH4 to read this macro thesis.",
    alternates: { canonical },
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: "DEPTH4",
      title: "DEPTH4 · Macro thesis",
      description: "Sign in to DEPTH4 to read this macro thesis.",
    },
    twitter: {
      card: "summary",
      title: "DEPTH4 · Macro thesis",
      description: "Sign in to DEPTH4 to read this macro thesis.",
    },
  };
}
