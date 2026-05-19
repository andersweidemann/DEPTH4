import { redirect } from "next/navigation";

/** Legacy URL — card view lives at /theses. */
export default function MapRedirectPage() {
  redirect("/theses");
}
