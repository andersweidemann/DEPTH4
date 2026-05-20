"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  isDepth4PublicReadModeClient,
  isPublicReadWorkspacePath,
} from "@/lib/depth4-public-read-paths";

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
  const publicRead =
    Boolean(requireAuth) &&
    isDepth4PublicReadModeClient() &&
    isPublicReadWorkspacePath(pathname ?? "");

  useEffect(() => {
    if (!requireAuth || publicRead || isLoading) return;
    if (!isAuthenticated) {
      const q = searchParams?.toString();
      const path = pathname + (q ? `?${q}` : "");
      const next = encodeURIComponent(path);
      window.location.replace(`/login?next=${next}`);
    }
  }, [requireAuth, publicRead, isLoading, isAuthenticated, pathname, searchParams]);

  if (!requireAuth || publicRead) {
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
