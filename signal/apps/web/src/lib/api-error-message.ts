import { HttpError, NetworkError } from "@/lib/http-error";

function messageForStatus(status: number): string {
  switch (status) {
    case 401:
      return "Your session has expired. Please log in again.";
    case 403:
      return "You don't have access to this feature. Upgrade your plan?";
    case 404:
      return "Not found.";
    case 429:
      return "Too many requests. Please wait a moment.";
    default:
      if (status >= 500) return "Something went wrong. Please try again.";
      return "Failed to load. Please try again.";
  }
}

function statusFromMessage(message: string): number | null {
  const m = message.match(/Request failed \((\d+)\)/);
  if (m) return Number(m[1]);
  return null;
}

/**
 * Maps thrown errors (HTTP status, network, auth redirect throw) to user-facing copy.
 */
export function friendlyApiMessage(error: unknown): string {
  if (error instanceof HttpError) return messageForStatus(error.status);
  if (error instanceof NetworkError) return "Connection failed. Check your internet and retry.";
  if (error instanceof TypeError) {
    // fetch() often throws TypeError when offline
    return "Connection failed. Check your internet and retry.";
  }
  if (error instanceof Error) {
    if (error.message === "Unauthorized") return messageForStatus(401);
    const s = statusFromMessage(error.message);
    if (s != null) return messageForStatus(s);
  }
  return "Failed to load. Please try again.";
}
