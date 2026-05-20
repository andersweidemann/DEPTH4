import { authFetch } from "@/lib/api";

export async function fetchHiddenThesisIds(): Promise<string[]> {
  const res = await authFetch("/api/user/hidden-theses");
  if (!res.ok) return [];
  const j = (await res.json().catch(() => null)) as { thesisIds?: unknown } | null;
  const ids = j?.thesisIds;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
}

export async function hideThesisById(thesisId: string): Promise<boolean> {
  const res = await authFetch("/api/user/hidden-theses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thesisId }),
  });
  return res.ok;
}

export async function unhideThesisById(thesisId: string): Promise<boolean> {
  const res = await authFetch(`/api/user/hidden-theses?thesisId=${encodeURIComponent(thesisId)}`, {
    method: "DELETE",
  });
  return res.ok;
}

export async function hideThesisBySlug(slug: string): Promise<boolean> {
  const res = await authFetch(`/api/theses/${encodeURIComponent(slug)}/hide`, { method: "POST" });
  return res.ok;
}

export async function unhideThesisBySlug(slug: string): Promise<boolean> {
  const res = await authFetch(`/api/theses/${encodeURIComponent(slug)}/unhide`, { method: "POST" });
  return res.ok;
}
