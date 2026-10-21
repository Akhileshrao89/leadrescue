import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

describe("UI Components", () => {
  describe("Button", () => {
    it("renders children properly", () => {
      render(<Button>Click Me</Button>);
      expect(screen.getByRole("button", { name: /click me/i })).toBeDefined();
    });

    it("handles disabled state", () => {
      render(<Button disabled>Disabled</Button>);
      const button = screen.getByRole("button", {
        name: /disabled/i,
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it("displays spinner when isLoading is true", () => {
      render(<Button isLoading>Saving</Button>);
      const button = screen.getByRole("button", {
        name: /saving/i,
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });
  });

  describe("Input", () => {
    it("renders accessible input with error description", () => {
      render(<Input id="test-input" error="Invalid value" />);
      const input = screen.getByRole("textbox");
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.getAttribute("aria-describedby")).toBe("test-input-error");
      expect(screen.getByText("Invalid value")).toBeDefined();
    });
  });

  describe("Badge", () => {
    it("renders stage badge variant", () => {
      render(<Badge variant="qualified">QUALIFIED</Badge>);
      expect(screen.getByText("QUALIFIED")).toBeDefined();
    });
  });

  describe("Alert", () => {
    it("renders with role=alert", () => {
      render(
        <Alert variant="warning">
          <AlertTitle>Warning Title</AlertTitle>
          <AlertDescription>Warning description text</AlertDescription>
        </Alert>,
      );
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByText("Warning Title")).toBeDefined();
    });
  });

  describe("EmptyState", () => {
    it("renders title, description and action", () => {
      render(
        <EmptyState
          title="No leads found"
          description="Try a different search"
          action={<button>Add Lead</button>}
        />,
      );
      expect(screen.getByText("No leads found")).toBeDefined();
      expect(screen.getByText("Try a different search")).toBeDefined();
      expect(screen.getByRole("button", { name: "Add Lead" })).toBeDefined();
    });
  });
});
