import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names safely with Tailwind CSS rules.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats a date string into human-readable representation.
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "Not scheduled";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Formats a date string with relative status (Overdue, Due Today, Upcoming).
 */
export function getFollowUpStatus(dateString: string | null | undefined): {
  label: string;
  variant: "destructive" | "warning" | "default" | "muted";
} {
  if (!dateString) {
    return { label: "Unscheduled", variant: "muted" };
  }
  const target = new Date(dateString);
  const now = new Date();

  // Set both to start of day for simple day comparison
  const targetDay = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  ).getTime();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  if (targetDay < today) {
    return { label: "Overdue", variant: "destructive" };
  } else if (targetDay === today) {
    return { label: "Due Today", variant: "warning" };
  } else {
    return { label: "Upcoming", variant: "default" };
  }
}
