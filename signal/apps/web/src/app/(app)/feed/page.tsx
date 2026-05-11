import type { Metadata } from "next";
import { FeedChunkPage } from "@/components/thesis-engine-v2/FeedChunkPage";

export const metadata: Metadata = {
  title: "DEPTH4 · Feed",
  description: "Incoming macro signals matched into active theses.",
};

export default function FeedPage() {
  return <FeedChunkPage />;
}
