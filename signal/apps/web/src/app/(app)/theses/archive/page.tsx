import type { Metadata } from "next";
import { LiveArchiveThesesListPage } from "@/components/thesis-engine-v2/LiveArchiveThesesListPage";

export const metadata: Metadata = {
  title: "DEPTH4 · Thesis archive",
  description: "Resolved and invalidated theses with outcomes.",
};

export default function ThesisArchivePage() {
  return <LiveArchiveThesesListPage />;
}
