"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  isAlwaysPublicThesisPath,
  isDepth4PublicReadModeClient,
  isPublicReadWorkspacePath,
} from "@/lib/depth4-public-read-paths";

/** Anonymous visitor on public thesis routes (or full workspace when env flag is on). */
export function usePublicReadOnlyWorkspace(): boolean {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname() ?? "";
  if (isLoading || isAuthenticated) return false;
  return (
    isAlwaysPublicThesisPath(pathname) ||
    (isDepth4PublicReadModeClient() && isPublicReadWorkspacePath(pathname))
  );
}
