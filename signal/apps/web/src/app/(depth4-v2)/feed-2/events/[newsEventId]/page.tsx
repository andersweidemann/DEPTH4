import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";
import { MacroReasoningDetail } from "@/components/macro-reasoning/MacroReasoningDetail";
import { thesesLiveHeaderNeutral } from "@/lib/thesis-engine-v2/live-header-copy";
import { createClient } from "@/lib/supabase/server";
import { fetchReasoningByNewsEventId, parseReasoningPayload } from "@/lib/feed/promoted-macro-events";
import { fetchThesisSlugMap } from "@/lib/feed/thesis-slugs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Props = { params: { newsEventId: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { newsEventId } = params;
  if (!UUID_RE.test(newsEventId)) return { title: "Event · DEPTH4" };
  const supabase = await createClient();
  const row = await fetchReasoningByNewsEventId(supabase, newsEventId);
  const pr = row ? parseReasoningPayload(row) : null;
  const title = pr?.parsed.event_summary?.slice(0, 72) ?? "Macro reasoning";
  return {
    title: `${title} · DEPTH4`,
    description: pr?.parsed.reasoning_summary ?? "DEPTH4 macro reasoning — causal chain and mispricing view.",
  };
}

export default async function FeedEventReasoningPage({ params }: Props) {
  const { newsEventId } = params;
  if (!UUID_RE.test(newsEventId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <AppHeader active="feed" liveLine={thesesLiveHeaderNeutral()} alertsSlot={<ThesisAlertsBell />} />
        <main className="mx-auto max-w-3xl px-5 pb-20 pt-10">
          <p className="text-[13px] text-zinc-400">
            Sign in to view macro reasoning.{" "}
            <Link href="/login" className="text-[#E8473F] underline-offset-2 hover:underline">
              Log in
            </Link>
          </p>
        </main>
      </>
    );
  }

  const row = await fetchReasoningByNewsEventId(supabase, newsEventId);
  if (!row) notFound();

  const pr = parseReasoningPayload(row);
  if (!pr) notFound();

  const thesisSlugById = await fetchThesisSlugMap(supabase, pr.parsed.affected_theses);
  const news = pr.news;
  const headline = news?.headline?.trim() ?? pr.parsed.event_summary;

  return (
    <>
      <AppHeader active="feed" liveLine={thesesLiveHeaderNeutral()} alertsSlot={<ThesisAlertsBell />} />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-8">
        <nav className="mb-8 text-[12px] text-zinc-500">
          <Link href="/feed-2" className="text-zinc-400 hover:text-zinc-200">
            ← Feed
          </Link>
        </nav>
        {news?.headline ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">Anchor headline</p>
        ) : null}
        {news?.headline ? <p className="mt-1 text-[14px] leading-snug text-zinc-200">{headline}</p> : null}

        <div className={news?.headline ? "mt-10" : ""}>
          <MacroReasoningDetail
            reasoning={pr.parsed}
            thesisSlugById={thesisSlugById}
            meta={{
              model: row.model,
              prompt_version: row.prompt_version,
              created_at: row.created_at,
            }}
          />
        </div>
      </main>
    </>
  );
}
