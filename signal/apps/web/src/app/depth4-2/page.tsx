import { redirect } from "next/navigation";

/** Hidden launcher — sends to DEPTH4 2.0 prototype home. */
export default function Depth42LauncherPage() {
  redirect("/theses");
}
