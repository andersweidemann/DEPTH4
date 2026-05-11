"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export function RouteGuard({
  children,
  requireAuth,
}: {
  children: React.ReactNode;
  requireAuth?: boolean;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!requireAuth || isLoading) return;
    if (!isAuthenticated) {
      const q = searchParams?.toString();
      const path = pathname + (q ? `?${q}` : "");
      const next = encodeURIComponent(path);
      window.location.replace(`/login?next=${next}`);
    }
  }, [requireAuth, isLoading, isAuthenticated, pathname, searchParams]);

  if (!requireAuth) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0c0c0e]">
        <div className="h-4 w-32 animate-pulse rounded bg-zinc-800" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0c0c0e]">
        <div className="h-4 w-32 animate-pulse rounded bg-zinc-800" />
      </div>
    );
  }

  return <>{children}</>;
}
