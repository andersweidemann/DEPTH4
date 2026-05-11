import type { Metadata } from "next";
import { HelpChunkPage } from "@/components/thesis-engine-v2/HelpChunkPage";

export const metadata: Metadata = {
  title: "DEPTH4 · Help",
  description: "Task-oriented help center for using DEPTH4.",
};

export default function HelpPage() {
  return <HelpChunkPage />;
}
