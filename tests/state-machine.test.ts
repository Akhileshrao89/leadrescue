import { describe, it, expect } from "vitest";
import {
  canTransitionStage,
  getAllowedTransitions,
  validateStageTransition,
  ALLOWED_TRANSITIONS,
} from "@/features/leads/state-machine";
import { LeadStage } from "@/features/leads/types";

describe("Phase 5: Lead Lifecycle State Machine", () => {
  describe("Allowed Next Stages Matrix", () => {
    it("matches product spec and domain model transitions", () => {
      expect(ALLOWED_TRANSITIONS.NEW).toEqual(["CONTACTED", "LOST"]);
      expect(ALLOWED_TRANSITIONS.CONTACTED).toEqual([
        "QUALIFIED",
        "LOST",
        "CONTACTED",
      ]);
      expect(ALLOWED_TRANSITIONS.QUALIFIED).toEqual(["PROPOSAL", "LOST"]);
      expect(ALLOWED_TRANSITIONS.PROPOSAL).toEqual(["WON", "LOST"]);
      expect(ALLOWED_TRANSITIONS.LOST).toEqual(["NEW"]);
      expect(ALLOWED_TRANSITIONS.WON).toEqual(["NEW"]);
    });
  });

  describe("canTransitionStage", () => {
    it("allows valid forward progressions", () => {
      expect(canTransitionStage("NEW", "CONTACTED")).toBe(true);
      expect(canTransitionStage("CONTACTED", "QUALIFIED")).toBe(true);
      expect(canTransitionStage("QUALIFIED", "PROPOSAL")).toBe(true);
      expect(canTransitionStage("PROPOSAL", "WON")).toBe(true);
    });

    it("allows dropping to LOST from active pipeline stages", () => {
      expect(canTransitionStage("NEW", "LOST")).toBe(true);
      expect(canTransitionStage("CONTACTED", "LOST")).toBe(true);
      expect(canTransitionStage("QUALIFIED", "LOST")).toBe(true);
      expect(canTransitionStage("PROPOSAL", "LOST")).toBe(true);
    });

    it("allows re-activating LOST and WON leads to NEW", () => {
      expect(canTransitionStage("LOST", "NEW")).toBe(true);
      expect(canTransitionStage("WON", "NEW")).toBe(true);
    });

    it("allows re-contacting in CONTACTED stage", () => {
      expect(canTransitionStage("CONTACTED", "CONTACTED")).toBe(true);
    });

    it("allows idempotency (transition to same stage)", () => {
      const allStages: LeadStage[] = [
        "NEW",
        "CONTACTED",
        "QUALIFIED",
        "PROPOSAL",
        "WON",
        "LOST",
      ];
      allStages.forEach((stage) => {
        expect(canTransitionStage(stage, stage)).toBe(true);
      });
    });

    it("rejects illegal skip transitions", () => {
      // Cannot jump from NEW straight to WON without outreach or proposal
      expect(canTransitionStage("NEW", "WON")).toBe(false);
      expect(canTransitionStage("NEW", "PROPOSAL")).toBe(false);
      expect(canTransitionStage("NEW", "QUALIFIED")).toBe(false);

      // Cannot jump from CONTACTED straight to WON
      expect(canTransitionStage("CONTACTED", "WON")).toBe(false);
      expect(canTransitionStage("CONTACTED", "PROPOSAL")).toBe(false);

      // Cannot jump from QUALIFIED directly to WON
      expect(canTransitionStage("QUALIFIED", "WON")).toBe(false);
    });
  });

  describe("validateStageTransition", () => {
    it("returns valid: true for legal transitions", () => {
      const res = validateStageTransition("NEW", "CONTACTED");
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it("returns informative error message listing allowed next stages for illegal transitions", () => {
      const res = validateStageTransition("NEW", "WON");
      expect(res.valid).toBe(false);
      expect(res.error).toBeDefined();
      expect(res.error).toContain(
        "Invalid stage transition from 'NEW' to 'WON'",
      );
      expect(res.error).toContain("CONTACTED, LOST");
    });
  });

  describe("getAllowedTransitions", () => {
    it("returns an array copy of allowed stages", () => {
      const transitions = getAllowedTransitions("PROPOSAL");
      expect(transitions).toEqual(["WON", "LOST"]);
    });
  });
});
