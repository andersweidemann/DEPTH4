import type { Metadata } from "next";
import { CausalMapPage } from "@/components/causal-map/CausalMapPage";

export const metadata: Metadata = {
  title: "DEPTH4 · Causal map",
  description: "Global causal graph — macro events, thesis edges, and asset ripples from live data.",
};

export default function CausalMapRoutePage() {
  return <CausalMapPage />;
}
