/**
 * Events delivered by a thesis “live” stream. The mock source emits `mock_tick`;
 * an SSE/WebSocket adapter can emit the same tick signal or richer patch events later.
 */
export type ThesisLiveStreamEvent = {
  kind: "mock_tick";
  /** Source clock (ms). */
  at: number;
};

export type ThesisStreamUnsubscribe = () => void;

/** Subscribe to live thesis stream events. Same shape for mock timer, SSE, or WS. */
export type ThesisStreamSource = {
  subscribe: (handler: (event: ThesisLiveStreamEvent) => void) => ThesisStreamUnsubscribe;
};
