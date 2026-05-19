import { ImageResponse } from "next/og";
import type { ThesisShareSnapshot } from "@/lib/thesis-engine-v2/thesis-share-metadata";
import { THESIS_OG_IMAGE_HEIGHT, THESIS_OG_IMAGE_WIDTH } from "@/lib/thesis-engine-v2/thesis-share-metadata";

export const thesisOgImageSize = {
  width: THESIS_OG_IMAGE_WIDTH,
  height: THESIS_OG_IMAGE_HEIGHT,
};

const DEFAULT_SNAPSHOT: ThesisShareSnapshot = {
  slug: "",
  title: "DEPTH4",
  ogTitle: "DEPTH4 macro thesis",
  description: "Tradable macro theses with cause, path, timing, and mispricing.",
  imageHeadline: "DEPTH4",
  imageSubline: "Macro intelligence · four-depth chain · mispricing",
};

export function renderThesisOgImage(snap: ThesisShareSnapshot = DEFAULT_SNAPSHOT) {
  const isDefault = !snap.slug;
  const headline = snap.imageHeadline || snap.ogTitle;
  const subline = snap.imageSubline || snap.description;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#111110",
          padding: 72,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#E8473F",
              }}
            />
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "0.14em",
                color: "#E8473F",
              }}
            >
              DEPTH4
            </span>
            <span style={{ fontSize: 18, color: "#52525b" }}>·</span>
            <span style={{ fontSize: 18, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Macro thesis
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            flex: 1,
            justifyContent: "center",
            maxWidth: 1000,
          }}
        >
          <div
            style={{
              fontSize: isDefault ? 56 : 48,
              fontWeight: 700,
              color: "#fafafa",
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
            }}
          >
            {headline}
          </div>
          <div
            style={{
              fontSize: 26,
              lineHeight: 1.45,
              color: "#a1a1aa",
              maxWidth: 920,
            }}
          >
            {subline}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <span style={{ fontSize: 20, color: "#52525b" }}>depth4.com</span>
          {!isDefault ? (
            <span
              style={{
                fontSize: 16,
                color: "#3f3f46",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
              }}
            >
              Reader view
            </span>
          ) : null}
        </div>
      </div>
    ),
    { ...thesisOgImageSize },
  );
}
