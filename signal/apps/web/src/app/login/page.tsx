import { AuthPanel } from "@/components/auth/AuthPanel";
import { safeAppPath } from "@/lib/app-paths";

type Props = {
  searchParams: Record<string, string | string[] | undefined>;
};

function pickString(v: string | string[] | undefined, fallback: string) {
  if (typeof v === "string" && v.length > 0) return v;
  if (Array.isArray(v) && v[0]) return v[0]!;
  return fallback;
}

export default function LoginPage({ searchParams }: Props) {
  const next = safeAppPath(pickString(searchParams.next, "/dashboard"));
  const rawIntent = pickString(searchParams.intent, "signin");
  const intent = rawIntent === "signup" ? "signup" : "signin";

  return (
    <div className="min-h-dvh flex flex-col grid-bg px-4 py-10">
      <AuthPanel nextPath={next} intent={intent} />
      <p className="text-center text-sm text-zinc-500 mt-10 max-w-5xl mx-auto w-full">
        <a href="/" className="text-zinc-400 hover:text-zinc-200">
          ← Back to home
        </a>
      </p>
    </div>
  );
}
