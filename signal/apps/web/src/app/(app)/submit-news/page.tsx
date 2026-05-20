import type { Metadata } from "next";
import { SubmitNewsPage } from "@/components/news/SubmitNewsPage";

export const metadata: Metadata = {
  title: "DEPTH4 · Submit news",
  description: "Submit a headline or URL for DEPTH4 evidence analysis.",
};

export default function Page() {
  return <SubmitNewsPage />;
}
