"use client";

type ErrorBannerProps = {
  message: string;
  onRetry?: () => void;
};

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="py-20 text-center">
      <p className="text-[14px] text-red-400">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1 text-[12px] text-amber-400 transition-colors hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e] rounded-sm"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
            />
          </svg>
          Retry
        </button>
      ) : null}
    </div>
  );
}
