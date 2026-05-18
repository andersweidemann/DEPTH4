/** In-process observability for public reader analytics writes (Phase 4D.1). */

export type ReaderAnalyticsOpsState = {
  writeFailures: number;
  lastFailureAt: string | null;
  lastFailureMessage: string | null;
  lastSuccessAt: string | null;
};

const state: ReaderAnalyticsOpsState = {
  writeFailures: 0,
  lastFailureAt: null,
  lastFailureMessage: null,
  lastSuccessAt: null,
};

export function getReaderAnalyticsOpsState(): ReaderAnalyticsOpsState {
  return { ...state };
}

export function recordReaderAnalyticsWriteSuccess(): void {
  state.lastSuccessAt = new Date().toISOString();
}

export function recordReaderAnalyticsWriteFailure(message: string): void {
  state.writeFailures += 1;
  state.lastFailureAt = new Date().toISOString();
  state.lastFailureMessage = message.slice(0, 500);
}

export function resetReaderAnalyticsOpsStateForTests(): void {
  state.writeFailures = 0;
  state.lastFailureAt = null;
  state.lastFailureMessage = null;
  state.lastSuccessAt = null;
}
