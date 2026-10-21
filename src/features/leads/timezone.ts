/**
 * Timezone utilities for calculating workspace-local calendar boundaries in UTC.
 */

export interface DayBounds {
  startOfTodayUTC: Date;
  endOfTodayUTC: Date;
}

/**
 * Calculates start and end of "Today" in the given IANA timezone, returned as UTC Date instances.
 */
export function getWorkspaceTodayBounds(
  timezone: string = "UTC",
  now: Date = new Date(),
): DayBounds {
  // 1. Format the current time in the workspace timezone to get year, month, day
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  // Local calendar date in target timezone
  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10) - 1; // 0-indexed
  const day = parseInt(map.day, 10);

  // Construct local midnight and 23:59:59 in target timezone
  // We determine the offset of the target timezone at midnight
  const approximateMidnightUTC = new Date(Date.UTC(year, month, day, 0, 0, 0));

  // Calculate timezone offset at this day
  const targetMidnightParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(approximateMidnightUTC);

  const localHourAtUTCZero = parseInt(
    targetMidnightParts.find((p) => p.type === "hour")?.value || "0",
    10,
  );

  // Shift to target midnight UTC
  const offsetHours = localHourAtUTCZero === 24 ? 0 : localHourAtUTCZero;
  const startOfTodayUTC = new Date(
    approximateMidnightUTC.getTime() - offsetHours * 3600000,
  );
  const endOfTodayUTC = new Date(startOfTodayUTC.getTime() + 86400000 - 1);

  return {
    startOfTodayUTC,
    endOfTodayUTC,
  };
}
