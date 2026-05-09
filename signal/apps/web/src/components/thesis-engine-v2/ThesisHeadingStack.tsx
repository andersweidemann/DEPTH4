"use client";

import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";
import { formatThesisMicroLabel, getThesisDisplayTitle } from "@/lib/thesis-engine-v2/thesis-display-title";

type TitleLevel = "h1" | "h2";

export function ThesisHeadingStack({
  thesis,
  titleAs,
  microClassName,
  titleClassName,
  className,
}: {
  thesis: Pick<Thesis, "title" | "microLabel">;
  titleAs: TitleLevel;
  /** Micro line (3–6 words). */
  microClassName?: string;
  /** Full trade-sentence title. */
  titleClassName?: string;
  className?: string;
}) {
  const micro = formatThesisMicroLabel(thesis.microLabel);
  const title = getThesisDisplayTitle(thesis);
  const TitleTag = titleAs;

  return (
    <div className={cn("min-w-0", className)}>
      {micro ? (
        <p
          className={cn(
            "text-[11px] font-medium leading-snug tracking-tight text-zinc-500",
            titleAs === "h1" ? "sm:text-[12px]" : "",
            microClassName,
          )}
        >
          {micro}
        </p>
      ) : null}
      <TitleTag
        className={cn(
          micro ? "mt-1" : "",
          titleAs === "h1"
            ? "text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl"
            : "line-clamp-2 break-words font-semibold leading-snug tracking-tight text-zinc-100 group-hover:text-amber-100/95",
          titleClassName,
        )}
        title={title}
      >
        {title}
      </TitleTag>
    </div>
  );
}
