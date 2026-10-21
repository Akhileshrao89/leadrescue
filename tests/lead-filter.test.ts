import { describe, it, expect } from "vitest";
import { filterLeads } from "@/features/leads/lead-filter";
import { Lead } from "@/features/leads/types";

const mockLeads: Lead[] = [
  {
    id: "1",
    workspaceId: "ws1",
    firstName: "Sarah",
    lastName: "Jenkins",
    email: "sarah@dental.com",
    phone: "123",
    companyName: "Dental Co",
    stage: "CONTACTED",
    isArchived: false,
    version: 1,
    notes: "Needs local SEO",
    nextFollowUpAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    workspaceId: "ws1",
    firstName: "Marcus",
    lastName: "Vance",
    email: "marcus@hvac.com",
    companyName: "Vance HVAC",
    stage: "PROPOSAL",
    isArchived: false,
    version: 1,
    notes: "Sent proposal",
    nextFollowUpAt: new Date().toISOString(), // Today
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "3",
    workspaceId: "ws1",
    firstName: "Rachel",
    lastName: "Green",
    email: "rachel@bakery.com",
    companyName: "Bloom Bakery",
    stage: "WON",
    isArchived: false,
    version: 1,
    notes: "Paid deposit",
    nextFollowUpAt: null, // Unscheduled
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe("filterLeads", () => {
  it("returns all leads when filters are empty", () => {
    const results = filterLeads(mockLeads, {});
    expect(results).toHaveLength(3);
  });

  it("filters leads by search query across company name", () => {
    const results = filterLeads(mockLeads, { search: "HVAC" });
    expect(results).toHaveLength(1);
    expect(results[0].firstName).toBe("Marcus");
  });

  it("filters leads by search query across notes", () => {
    const results = filterLeads(mockLeads, { search: "local SEO" });
    expect(results).toHaveLength(1);
    expect(results[0].firstName).toBe("Sarah");
  });

  it("filters leads by stage", () => {
    const results = filterLeads(mockLeads, { stage: "WON" });
    expect(results).toHaveLength(1);
    expect(results[0].firstName).toBe("Rachel");
  });

  it("filters leads by overdue queue", () => {
    const results = filterLeads(mockLeads, { queue: "overdue" });
    expect(results).toHaveLength(1);
    expect(results[0].firstName).toBe("Sarah");
  });

  it("filters leads by due_today queue", () => {
    const results = filterLeads(mockLeads, { queue: "due_today" });
    expect(results).toHaveLength(1);
    expect(results[0].firstName).toBe("Marcus");
  });

  it("filters leads by unscheduled queue", () => {
    const results = filterLeads(mockLeads, { queue: "unscheduled" });
    expect(results).toHaveLength(1);
    expect(results[0].firstName).toBe("Rachel");
  });
});
