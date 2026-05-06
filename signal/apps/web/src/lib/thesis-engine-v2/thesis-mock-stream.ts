import { getThesisMockStreamIntervalMs } from "@/lib/thesis-engine-v2/thesis-stream-env";
import type { ThesisLiveStreamEvent, ThesisStreamSource } from "@/lib/thesis-engine-v2/thesis-stream-types";

/**
 * Local timer-driven stream (stand-in for SSE/WebSocket). Emits `mock_tick`; the
 * consumer runs {@link runMockThesisTick} and applies patches + side effects.
 */
export function createMockThesisStream(): ThesisStreamSource {
  return {
    subscribe(handler) {
      const ms = getThesisMockStreamIntervalMs();
      const id = window.setInterval(() => {
        const ev: ThesisLiveStreamEvent = { kind: "mock_tick", at: Date.now() };
        handler(ev);
      }, ms);
      return () => window.clearInterval(id);
    },
  };
}
