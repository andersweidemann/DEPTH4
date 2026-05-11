import type { Metadata } from "next";
import { BookPositionsChunkPage } from "@/components/thesis-engine-v2/BookPositionsChunkPage";

export const metadata: Metadata = {
  title: "DEPTH4 · Positions",
  description: "Your positions, tracked against live macro theses.",
};

export default function BookPage() {
  return <BookPositionsChunkPage />;
}
