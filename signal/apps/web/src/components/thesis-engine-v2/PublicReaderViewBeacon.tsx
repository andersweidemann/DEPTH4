"use client";

import { useEffect, useRef } from "react";

const COOKIE_NAME = "d4_reader_vid";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24;

function getOrCreateVisitorToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (match?.[1]) return decodeURIComponent(match[1]);
  const token =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `rv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${COOKIE_MAX_AGE_SEC}; Path=/; SameSite=Lax`;
  return token;
}

/**
 * Phase 4D — one client beacon per public reader mount (human confirmation, first-party cookie).
 * Failures are silent; never affects reading.
 */
export function PublicReaderViewBeacon({ slug }: { slug: string }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current || !slug) return;
    sent.current = true;
    const token = getOrCreateVisitorToken();
    void fetch(`/api/theses/${encodeURIComponent(slug)}/reader-view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorToken: token }),
      keepalive: true,
    }).catch(() => {
      /* analytics must not break reader */
    });
  }, [slug]);

  return null;
}
