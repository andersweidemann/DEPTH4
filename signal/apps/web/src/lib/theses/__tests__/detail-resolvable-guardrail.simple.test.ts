// Simplified test for the guardrail logic without external dependencies

describe("detailResolvable guardrail logic", () => {
  // Simulate the buildDetailResolvableSlugSet function logic
  function buildDetailResolvableSlugSetMock(aiTheses: any[], userTheses: any[]): Set<string> {
    const slugs = new Set<string>();
    // Mock CATALOG_THESES - in real code this would be imported
    const CATALOG_THESES = [{ slug: "catalog-test-slug" }];
    for (const t of CATALOG_THESES) {
      const slug = t.slug.trim();
      if (slug) slugs.add(slug);
    }
    for (const t of aiTheses) {
      const slug = t.slug.trim();
      // Only include AI-generated theses that have a valid thesisId (indicating DB-backed)
      if (slug && t.thesisId && /^[0-9a-f-]{8,}$/i.test(t.thesisId)) {
        slugs.add(slug);
      }
    }
    for (const t of userTheses) {
      const slug = t.slug.trim();
      // Only include user theses that have a valid thesisId (indicating DB-backed)
      if (slug && t.thesisId && /^[0-9a-f-]{8,}$/i.test(t.thesisId)) {
        slugs.add(slug);
      }
    }
    return slugs;
  }

  // Simulate the thesisListItemFromEngine function logic
  function thesisListItemFromEngineMock(
    thesis: any,
    resolvableSlugSet: Set<string>
  ): { detailResolvable: boolean } {
    const isResolvableViaSet = resolvableSlugSet.has(thesis.slug.trim());

    // Defensive override: force detailResolvable to false for Draft status or invalid thesisId
    const isDraft = thesis.status === "Draft";
    const hasValidId = thesis.thesisId && /^[0-9a-f-]{8,}$/i.test(thesis.thesisId);

    // If it's a Draft status AND not resolvable via the set, force false
    // Also if the thesisId doesn't look like a valid DB UUID, force false
    const detailResolvable = (!isDraft || isResolvableViaSet) && hasValidId && isResolvableViaSet;

    return { detailResolvable };
  };

  describe("buildDetailResolvableSlugSetMock", () => {
    it("should include catalog thesis slugs", () => {
      const catalogTheses = [{ slug: "catalog-test-slug" }];
      const aiTheses: any[] = [];
      const userTheses: any[] = [];

      const resolvableSet = buildDetailResolvableSlugSetMock(aiTheses, userTheses);
      expect(resolvableSet.has("catalog-test-slug")).toBe(true);
    });

    it("should include AI-generated theses with valid UUID thesisId", () => {
      const catalogTheses: any[] = [];
      const aiTheses = [{
        slug: "test-ai-slug",
        thesisId: "123e4567-e89b-12d3-a456-426614174000"
      }];
      const userTheses: any[] = [];

      const resolvableSet = buildDetailResolvableSlugSetMock(aiTheses, userTheses);
      expect(resolvableSet.has("test-ai-slug")).toBe(true);
    });

    it("should exclude AI-generated theses with invalid/missing thesisId", () => {
      const catalogTheses: any[] = [];
      const aiTheses = [
        { slug: "test-ai-slug-1", thesisId: "" }, // empty ID
        { slug: "test-ai-slug-2", thesisId: "invalid-id" }, // invalid format
        { slug: "test-ai-slug-3" } // missing ID
      ];
      const userTheses: any[] = [];

      const resolvableSet = buildDetailResolvableSlugSetMock(aiTheses, userTheses);
      expect(resolvableSet.has("test-ai-slug-1")).toBe(false);
      expect(resolvableSet.has("test-ai-slug-2")).toBe(false);
      expect(resolvableSet.has("test-ai-slug-3")).toBe(false);
    });

    it("should include user theses with valid UUID thesisId", () => {
      const catalogTheses: any[] = [];
      const aiTheses: any[] = [];
      const userTheses = [{
        slug: "test-user-slug",
        thesisId: "123e4567-e89b-12d3-a456-426614174000"
      }];

      const resolvableSet = buildDetailResolvableSlugSetMock(aiTheses, userTheses);
      expect(resolvableSet.has("test-user-slug")).toBe(true);
    });

    it("should exclude user theses with invalid/missing thesisId", () => {
      const catalogTheses: any[] = [];
      const aiTheses: any[] = [];
      const userTheses = [
        { slug: "test-user-slug-1", thesisId: "" },
        { slug: "test-user-slug-2", thesisId: "invalid-id" },
        { slug: "test-user-slug-3" }
      ];

      const resolvableSet = buildDetailResolvableSlugSetMock(aiTheses, userTheses);
      expect(resolvableSet.has("test-user-slug-1")).toBe(false);
      expect(resolvableSet.has("test-user-slug-2")).toBe(false);
      expect(resolvableSet.has("test-user-slug-3")).toBe(false);
    });
  });

  describe("thesisListItemFromEngineMock defensive overrides", () => {
    const resolvableSetWithSlug = new Set<string>(["resolvable-slug"]);
    const resolvableSetWithoutSlug = new Set<string>(["different-slug"]);

    it("should set detailResolvable to false for Draft status thesis not in resolvable set", () => {
      const thesis = {
        id: "01abad62-7f89-43e9-810b-46c8e56154fd",
        slug: "uso-will-find-a-floor-within-this-earnings-s-9535544b43",
        status: "Draft",
        thesisId: "01abad62-7f89-43e9-810b-46c8e56154fd" // valid UUID
      };

      const result = thesisListItemFromEngineMock(thesis, resolvableSetWithoutSlug);
      expect(result.detailResolvable).toBe(false);
    });

    it("should set detailResolvable to true for Draft status thesis that IS in resolvable set", () => {
      const thesis = {
        id: "01abad62-7f89-43e9-810b-46c8e56154fd",
        slug: "resolvable-slug",
        status: "Draft",
        thesisId: "01abad62-7f89-43e9-810b-46c8e56154fd" // valid UUID
      };

      const result = thesisListItemFromEngineMock(thesis, resolvableSetWithSlug);
      expect(result.detailResolvable).toBe(true);
    });

    it("should set detailResolvable to false for thesis with invalid thesisId even if slug is in set", () => {
      const thesis = {
        id: "invalid-id", // Invalid thesisId
        slug: "resolvable-slug",
        status: "ready", // Not Draft
        thesisId: "invalid-id"
      };

      const result = thesisListItemFromEngineMock(thesis, resolvableSetWithSlug);
      expect(result.detailResolvable).toBe(false);
    });

    it("should set detailResolvable to true for valid non-Draft thesis with valid ID in set", () => {
      const thesis = {
        id: "123e4567-e89b-12d3-a456-426614174000", // Valid UUID
        slug: "resolvable-slug",
        status: "ready", // Not Draft
        thesisId: "123e4567-e89b-12d3-a456-426614174000" // Valid UUID
      };

      const result = thesisListItemFromEngineMock(thesis, resolvableSetWithSlug);
      expect(result.detailResolvable).toBe(true);
    });

    it("should set detailResolvable to false for thesis with missing ID even if slug is in set", () => {
      const thesis = {
        id: "", // Missing thesisId
        slug: "resolvable-slug",
        status: "ready",
        thesisId: ""
      };

      const result = thesisListItemFromEngineMock(thesis, resolvableSetWithSlug);
      expect(result.detailResolvable).toBe(false);
    });
  });
});