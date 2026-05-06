import type { ThesisStreamSource } from "@/lib/thesis-engine-v2/thesis-stream-types";

/**
 * Placeholder for a future SSE/WebSocket-backed stream. Implement `subscribe`
 * with `EventSource` or `WebSocket` and map messages to {@link ThesisLiveStreamEvent}.
 */
export function createIdleThesisStream(): ThesisStreamSource {
  return {
    subscribe() {
      return () => {};
    },
  };
}
