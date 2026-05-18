import type { Metadata } from "next";
import { CommunityComingSoon } from "@/components/marketing/CommunityComingSoon";

export const metadata: Metadata = {
  title: "DEPTH4 · Community",
  description: "Published theses from the DEPTH4 community.",
};

export default function CommunityPage() {
  return <CommunityComingSoon />;
}
