"use client";

import useSWR from "swr";
import { authFetch } from "@/lib/api";
import { HttpError } from "@/lib/http-error";
import type { CausalChainResponse } from "@/types/causal-graph";

export const causalChainKey = (slug: string) =>
  `/api/theses/${encodeURIComponent(slug)}/causal`;

async function fetchCausalChain(url: string): Promise<CausalChainResponse | null> {
  const res = await authFetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(res.status);
  return (await res.json()) as CausalChainResponse;
}

export function useCausalChain(slug: string | null | undefined) {
  const key = slug?.trim() ? causalChainKey(slug.trim()) : null;
  return useSWR<CausalChainResponse | null>(key, fetchCausalChain, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
}

export function useThesisHasCausalCluster(slug: string | null | undefined): boolean {
  const { data } = useCausalChain(slug);
  return data != null;
}
