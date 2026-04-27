import { DemoPage } from "./DemoPage";

/** Avoid static prerender; full client tree + flight payload can hit webpack require errors in `next build`. */
export const dynamic = "force-dynamic";

export default function Page() {
  return <DemoPage />;
}
