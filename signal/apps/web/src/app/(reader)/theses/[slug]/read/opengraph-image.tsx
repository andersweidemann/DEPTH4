import { loadThesisShareSnapshot } from "@/lib/thesis-engine-v2/load-thesis-share-snapshot";
import { isThesisReaderPublic } from "@/lib/thesis-engine-v2/thesis-reader-public";
import { renderThesisOgImage, thesisOgImageSize } from "@/lib/thesis-engine-v2/thesis-og-image";

export const runtime = "edge";
export const alt = "DEPTH4 macro thesis";
export const size = thesisOgImageSize;
export const contentType = "image/png";

type Props = { params: { slug: string } };

export default async function ThesisReaderOgImage({ params }: Props) {
  const slug = params.slug?.trim() ?? "";
  if (!slug) return renderThesisOgImage();
  const isPublic = await isThesisReaderPublic(slug);
  if (!isPublic) return renderThesisOgImage();
  const snap = await loadThesisShareSnapshot(slug);
  return renderThesisOgImage(snap);
}
