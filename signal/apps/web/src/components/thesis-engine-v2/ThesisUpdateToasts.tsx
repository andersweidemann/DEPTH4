"use client";

import { useThesisUpdateToasts } from "@/hooks/use-thesis-update-toasts";

/** Mount once in authenticated app shell — subscribes to thesis_updates realtime. */
export function ThesisUpdateToasts() {
  useThesisUpdateToasts();
  return null;
}
