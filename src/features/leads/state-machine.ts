import { LeadStage } from "./types";

/**
 * Validated Lead Lifecycle State Machine rules according to Product Spec & Domain Model:
 *
 * NEW         -> CONTACTED, LOST
 * CONTACTED   -> QUALIFIED, LOST, CONTACTED (re-contact)
 * QUALIFIED   -> PROPOSAL, LOST
 * PROPOSAL    -> WON, LOST
 * LOST        -> NEW (re-activated prospect)
 * WON         -> NEW (renewal / upsell opportunity)
 */
export const ALLOWED_TRANSITIONS: Record<LeadStage, readonly LeadStage[]> = {
  NEW: ["CONTACTED", "LOST"],
  CONTACTED: ["QUALIFIED", "LOST", "CONTACTED"],
  QUALIFIED: ["PROPOSAL", "LOST"],
  PROPOSAL: ["WON", "LOST"],
  LOST: ["NEW"],
  WON: ["NEW"],
};

/**
 * Checks whether a stage change is valid under the state machine.
 * Transitioning to the exact same stage is permitted for operational idempotency.
 */
export function canTransitionStage(
  currentStage: LeadStage,
  targetStage: LeadStage,
): boolean {
  if (currentStage === targetStage) {
    return true;
  }
  const allowed = ALLOWED_TRANSITIONS[currentStage];
  return allowed ? allowed.includes(targetStage) : false;
}

/**
 * Retrieves the list of valid next stages from the current stage.
 */
export function getAllowedTransitions(currentStage: LeadStage): LeadStage[] {
  return [...ALLOWED_TRANSITIONS[currentStage]];
}

/**
 * Validates a stage transition and returns human-readable error if invalid.
 */
export function validateStageTransition(
  currentStage: LeadStage,
  targetStage: LeadStage,
): { valid: boolean; error?: string } {
  if (canTransitionStage(currentStage, targetStage)) {
    return { valid: true };
  }

  const allowedList = getAllowedTransitions(currentStage).join(", ");
  return {
    valid: false,
    error: `Invalid stage transition from '${currentStage}' to '${targetStage}'. Permitted next stages: [${allowedList}].`,
  };
}
