"use client";

import { cn } from "@/lib/utils";

/**
 * Plain form POST to `/auth/sign-out` — works without JavaScript.
 * Server responds with **302 to the welcome page** (`/`), not `/login`, after clearing the session.
 */
export function LogoutButton({
  className,
  buttonClassName,
}: {
  className?: string;
  /** Override default header button styles (e.g. admin strip). */
  buttonClassName?: string;
}) {
  return (
    <form action="/auth/sign-out" method="post" className={cn("inline", className)}>
      <button
        type="submit"
        className={cn(
          "min-h-11 rounded-md px-2.5 py-2 text-[13px] font-medium text-zinc-500 transition-colors sm:min-h-0 sm:px-2 sm:py-1 sm:text-xs",
          "hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8473F]",
          buttonClassName,
        )}
      >
        Log out
      </button>
    </form>
  );
}
