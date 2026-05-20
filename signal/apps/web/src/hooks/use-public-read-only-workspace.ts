"use client";

import { useAuth } from "@/contexts/AuthContext";
import { isDepth4PublicReadModeClient } from "@/lib/depth4-public-read-paths";

/** Anonymous visitor on `/theses`, `/feed`, etc. when public read mode is enabled. */
export function usePublicReadOnlyWorkspace(): boolean {
  const { isAuthenticated, isLoading } = useAuth();
  return isDepth4PublicReadModeClient() && !isLoading && !isAuthenticated;
}
