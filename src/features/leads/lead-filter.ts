import { Lead, LeadStage, FollowUpQueueType } from "./types";

export interface FilterLeadsOptions {
  search?: string;
  stage?: LeadStage | "ALL";
  queue?: FollowUpQueueType | "ALL";
}

/**
 * Filters a list of leads based on search term, stage, and follow-up queue category.
 */
export function filterLeads(
  leads: Lead[],
  options: FilterLeadsOptions,
): Lead[] {
  const { search, stage = "ALL", queue = "ALL" } = options;
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  return leads.filter((lead) => {
    // 1. Search filter
    if (search && search.trim().length > 0) {
      const q = search.toLowerCase().trim();
      const name = `${lead.firstName} ${lead.lastName || ""}`.toLowerCase();
      const email = (lead.email || "").toLowerCase();
      const company = (lead.companyName || "").toLowerCase();
      const notes = (lead.notes || "").toLowerCase();
      if (
        !name.includes(q) &&
        !email.includes(q) &&
        !company.includes(q) &&
        !notes.includes(q)
      ) {
        return false;
      }
    }

    // 2. Stage filter
    if (stage !== "ALL" && lead.stage !== stage) {
      return false;
    }

    // 3. Queue filter
    if (queue !== "ALL") {
      if (!lead.nextFollowUpAt) {
        if (queue !== "unscheduled") return false;
      } else {
        const target = new Date(lead.nextFollowUpAt);
        const targetDay = new Date(
          target.getFullYear(),
          target.getMonth(),
          target.getDate(),
        ).getTime();
        if (queue === "overdue" && targetDay >= todayStart) return false;
        if (queue === "due_today" && targetDay !== todayStart) return false;
        if (queue === "upcoming" && targetDay <= todayStart) return false;
        if (queue === "unscheduled") return false;
      }
    }

    return true;
  });
}
