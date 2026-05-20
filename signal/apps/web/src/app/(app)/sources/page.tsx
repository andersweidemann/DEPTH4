import type { Metadata } from "next";
import { SourcesPage } from "@/components/news/SourcesPage";

export const metadata: Metadata = {
  title: "DEPTH4 · Sources",
  description: "RSS and wire sources DEPTH4 ingests for macro thesis reasoning.",
};

export default function Page() {
  return <SourcesPage />;
}
