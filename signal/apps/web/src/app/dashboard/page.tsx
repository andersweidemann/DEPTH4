import { DashboardClient } from "./DashboardClient";
import { Suspense } from "react";

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading…</div>}>
      <DashboardClient />
    </Suspense>
  );
}
