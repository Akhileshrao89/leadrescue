import { describe, it, expect } from "vitest";
import { getWorkspaceTodayBounds } from "@/features/leads/timezone";

describe("Timezone Boundary Calculations", () => {
  it("calculates 24-hour interval for UTC", () => {
    const fixedNow = new Date("2026-10-18T14:30:00Z");
    const { startOfTodayUTC, endOfTodayUTC } = getWorkspaceTodayBounds(
      "UTC",
      fixedNow,
    );

    expect(startOfTodayUTC.toISOString()).toBe("2026-10-18T00:00:00.000Z");
    expect(endOfTodayUTC.getTime() - startOfTodayUTC.getTime()).toBe(
      86400000 - 1,
    );
  });

  it("calculates appropriate UTC bounds for America/New_York", () => {
    const fixedNow = new Date("2026-10-18T14:30:00Z");
    const { startOfTodayUTC, endOfTodayUTC } = getWorkspaceTodayBounds(
      "America/New_York",
      fixedNow,
    );

    // America/New_York is UTC-4 in October (EDT)
    // Local midnight 00:00 EDT = 04:00 UTC
    expect(startOfTodayUTC.getUTCHours()).toBe(4);
    expect(endOfTodayUTC.getTime() - startOfTodayUTC.getTime()).toBe(
      86400000 - 1,
    );
  });

  it("calculates appropriate UTC bounds for Asia/Kolkata", () => {
    const fixedNow = new Date("2026-10-18T14:30:00Z");
    const { startOfTodayUTC, endOfTodayUTC } = getWorkspaceTodayBounds(
      "Asia/Kolkata",
      fixedNow,
    );

    // Asia/Kolkata is UTC+5:30. In the evening at 14:30 UTC, local time is 20:00 (still same calendar day)
    expect(endOfTodayUTC.getTime() - startOfTodayUTC.getTime()).toBe(
      86400000 - 1,
    );
  });
});
