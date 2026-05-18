import { describe, expect, it } from "vitest";
import {
  canManageThesisReaderDiscovery,
  discoverySortCompare,
  parseThesisReaderDiscoveryRow,
  readerDiscoveryLabelDisplay,
} from "./thesis-reader-discovery";
import type { ThesisReaderDiscoveryRow } from "./thesis-reader-discovery";
import { canManageThesisReaderPublic } from "./thesis-reader-publishing-access";

function row(overrides: Partial<ThesisReaderDiscoveryRow> = {}): ThesisReaderDiscoveryRow {
  return {
    id: "t1",
    slug: "example-thesis",
    reader_public_enabled: true,
    reader_public_discoverable: false,
    reader_discovery_label: null,
    reader_discovery_priority: 0,
    owner_user_id: null,
    thesis_origin: "seeded_system",
    updated_at: "2026-01-15T00:00:00Z",
    title: "Example",
    micro_label: null,
    ...overrides,
  };
}

describe("thesis-reader-discovery", () => {
  it("parseThesisReaderDiscoveryRow requires discoverable fields", () => {
    const parsed = parseThesisReaderDiscoveryRow({
      id: "t1",
      slug: "x",
      reader_public_enabled: true,
      reader_public_discoverable: true,
      reader_discovery_label: "featured",
      reader_discovery_priority: 10,
      thesis_origin: "seeded_system",
    });
    expect(parsed?.reader_public_discoverable).toBe(true);
    expect(parsed?.reader_discovery_label).toBe("featured");
    expect(parsed?.reader_discovery_priority).toBe(10);
  });

  it("discoverySortCompare orders featured before exemplar before recent ai", () => {
    const featured = row({
      reader_discovery_label: "featured",
      reader_discovery_priority: 0,
      updated_at: "2026-01-01T00:00:00Z",
    });
    const exemplar = row({
      reader_discovery_label: "exemplar",
      reader_discovery_priority: 0,
      updated_at: "2026-06-01T00:00:00Z",
    });
    const ai = row({
      reader_discovery_label: null,
      thesis_origin: "ai_generated",
      updated_at: "2026-06-02T00:00:00Z",
    });
    expect(discoverySortCompare(featured, exemplar)).toBeLessThan(0);
    expect(discoverySortCompare(exemplar, ai)).toBeLessThan(0);
  });

  it("higher discovery priority sorts first within tier", () => {
    const low = row({ reader_discovery_label: "curated", reader_discovery_priority: 1 });
    const high = row({ reader_discovery_label: "curated", reader_discovery_priority: 50 });
    expect(discoverySortCompare(high, low)).toBeLessThan(0);
  });

  it("seeded_system sorts before ai_generated when labels equal", () => {
    const seeded = row({ thesis_origin: "seeded_system", updated_at: "2026-01-01T00:00:00Z" });
    const ai = row({ thesis_origin: "ai_generated", updated_at: "2026-06-01T00:00:00Z" });
    expect(discoverySortCompare(seeded, ai)).toBeLessThan(0);
  });

  it("canManageThesisReaderDiscovery matches publishing access", () => {
    const catalog = row({ thesis_origin: "seeded_system", owner_user_id: null });
    const owner = row({ owner_user_id: "user-a", thesis_origin: "user" });
    expect(
      canManageThesisReaderDiscovery(catalog, { userId: "op", isElevated: true }),
    ).toBe(true);
    expect(
      canManageThesisReaderDiscovery(catalog, { userId: "random", isElevated: false }),
    ).toBe(false);
    expect(
      canManageThesisReaderDiscovery(owner, { userId: "user-a", isElevated: false }),
    ).toBe(canManageThesisReaderPublic(owner, { userId: "user-a", isElevated: false }));
  });

  it("readerDiscoveryLabelDisplay maps labels", () => {
    expect(readerDiscoveryLabelDisplay("exemplar")).toBe("Exemplar");
    expect(readerDiscoveryLabelDisplay(null)).toBeNull();
  });
});
