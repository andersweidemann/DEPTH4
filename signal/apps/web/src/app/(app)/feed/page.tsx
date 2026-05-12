import type { Metadata } from "next";
import { LiveFeedPage } from "@/components/thesis-engine-v2/LiveFeedPage";

export const metadata: Metadata = {
  title: "DEPTH4 · Feed",
  description: "News read, analyzed, and mapped to your theses.",
};

export default function FeedPage() {
  return <LiveFeedPage />;
}
