import type { Metadata } from "next";
import { TrackRecordPageClient } from "@/components/track-record/TrackRecordPageClient";

export const metadata: Metadata = {
  title: "DEPTH4 · Track Record",
  description: "Resolved thesis outcomes, win rate, and post-mortems.",
};

export default function TrackRecordPage() {
  return <TrackRecordPageClient />;
}
