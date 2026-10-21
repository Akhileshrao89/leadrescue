import { describe, it, expect } from "vitest";
import { generateDeterministicTemplate } from "@/features/ai-drafts/templates";
import { DraftTone, TouchpointType } from "@/features/ai-drafts/types";

describe("Phase 8: Instant Deterministic Draft Templates (<10ms)", () => {
  const context = {
    firstName: "Marcus",
    lastName: "Vance",
    companyName: "Vance Architecture",
    website: "https://vancearch.example.com",
    notes:
      "Spoke at trade expo. Needs redesigned portfolio and booking system.",
    senderAgencyName: "Apex Digital",
    senderName: "Sarah Connor",
  };

  const touchpoints: TouchpointType[] = [
    "FIRST_TOUCH",
    "POST_DISCOVERY",
    "PROPOSAL_CHECK_IN",
    "RE_ENGAGEMENT",
  ];

  const tones: DraftTone[] = ["FRIENDLY", "PROFESSIONAL", "URGENT"];

  touchpoints.forEach((touchpoint) => {
    tones.forEach((tone) => {
      it(`generates ${touchpoint} with ${tone} tone in < 10ms`, () => {
        const start = performance.now();
        const draft = generateDeterministicTemplate(touchpoint, tone, context);
        const duration = performance.now() - start;

        expect(duration).toBeLessThan(10); // Strict Acceptance Criteria: < 10ms
        expect(draft.subject).toBeTruthy();
        expect(draft.body).toBeTruthy();
        expect(draft.body).toContain("Marcus");
        expect(draft.body).toContain("Sarah Connor");
      });
    });
  });

  it("handles fallback gracefully when company name or notes are omitted", () => {
    const minimalContext = {
      firstName: "Alex",
    };

    const draft = generateDeterministicTemplate(
      "FIRST_TOUCH",
      "FRIENDLY",
      minimalContext,
    );
    expect(draft.subject).toContain("Alex");
    expect(draft.body).toContain("Alex");
    expect(draft.body).not.toContain("undefined");
    expect(draft.body).not.toContain("null");
  });
});
