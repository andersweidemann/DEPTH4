"use client";

import { useEffect } from "react";
import { ErrorBanner } from "@/components/shared/ErrorBanner";

export default function AppRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app route error]", error);
  }, [error]);

  return (
    <div className="pb-16">
      <ErrorBanner
        message={error.message || "Something went wrong loading this page."}
        onRetry={() => reset()}
      />
    </div>
  );
}
