import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GlobalError from "@/app/error";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("Phase 12: Global Error Boundary Component", () => {
  it("renders user-friendly message and incident ID", () => {
    const mockError = new Error("Test critical component failure") as Error & {
      digest?: string;
    };
    mockError.digest = "DIGEST-123456";
    const mockReset = vi.fn();

    render(<GlobalError error={mockError} reset={mockReset} />);

    expect(screen.getByText("Something went wrong")).toBeDefined();
    expect(
      screen.getByText(
        "An unexpected error occurred. Our automated telemetry has logged the incident for investigation.",
      ),
    ).toBeDefined();
    expect(screen.getByText("DIGEST-123456")).toBeDefined();
  });

  it("calls reset callback when Try Again button is clicked", () => {
    const mockError = new Error("Database network drop") as Error & {
      digest?: string;
    };
    const mockReset = vi.fn();

    render(<GlobalError error={mockError} reset={mockReset} />);

    const retryButton = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(retryButton);

    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it("navigates to /dashboard when Go to Dashboard button is clicked", () => {
    const mockError = new Error("Page fault") as Error & { digest?: string };
    const mockReset = vi.fn();

    render(<GlobalError error={mockError} reset={mockReset} />);

    const dashboardButton = screen.getByRole("button", {
      name: /go to dashboard/i,
    });
    fireEvent.click(dashboardButton);

    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });
});
