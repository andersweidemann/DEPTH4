"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { isProFromUserTier } from "@/lib/billing/subscription-access";

/**
 * Client subscription state from `/api/auth/me` profile (backed by `public.users`).
 */
export function useSubscription() {
  const { user, isLoading, isAuthenticated } = useAuth();

  const tier = useMemo<"free" | "pro">(() => {
    if (!user) return "free";
    return isProFromUserTier(user.tier) ? "pro" : "free";
  }, [user]);

  const status = user?.subscription?.status ?? "inactive";

  return {
    tier,
    status,
    loading: isLoading,
    isAuthenticated,
    isPro: tier === "pro",
  };
}
