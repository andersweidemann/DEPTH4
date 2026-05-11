import type { Metadata } from "next";
import { LiveThesesListPage } from "@/components/thesis-engine-v2/LiveThesesListPage";

export const metadata: Metadata = {
  title: "DEPTH4 · Theses",
  description: "Tracks macro events the market hasn't priced in yet.",
};

export default function ThesesDashboardPage() {
  return <LiveThesesListPage />;
}
