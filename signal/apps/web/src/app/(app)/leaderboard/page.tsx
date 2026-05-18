import type { Metadata } from "next";
import { LeaderboardComingSoon } from "@/components/marketing/LeaderboardComingSoon";

export const metadata: Metadata = {
  title: "DEPTH4 · Leaderboard",
  description: "Thesis accuracy rankings and resolution outcomes.",
};

export default function LeaderboardPage() {
  return <LeaderboardComingSoon />;
}
