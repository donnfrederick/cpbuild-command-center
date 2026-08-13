import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { TeamDirectory } from "@/components/team/TeamDirectory";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MEMBERS = [
  {
    id: "u1",
    name: "Alice Smith",
    email: "alice@cpbuild.com",
    role: "ADMIN",
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "u2",
    name: "Bob Jones",
    email: "bob@cpbuild.com",
    role: "MEMBER",
    createdAt: "2026-02-01T00:00:00Z",
  },
  {
    id: "u3",
    name: null,
    email: "unnamed@cpbuild.com",
    role: "DESIGNER",
    createdAt: "2026-03-01T00:00:00Z",
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TeamDirectory", () => {
  it("renders all team member names and emails", () => {
    render(<TeamDirectory members={MEMBERS} currentUserId="other" />);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("alice@cpbuild.com")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("bob@cpbuild.com")).toBeInTheDocument();
  });

  it("renders 'Unnamed user' for members with null name", () => {
    render(<TeamDirectory members={MEMBERS} currentUserId="other" />);
    expect(screen.getByText("Unnamed user")).toBeInTheDocument();
  });

  it("shows '(you)' label for the current user", () => {
    render(<TeamDirectory members={MEMBERS} currentUserId="u1" />);
    expect(screen.getByText("(you)")).toBeInTheDocument();
  });

  it("does not show '(you)' when currentUserId matches no member", () => {
    render(<TeamDirectory members={MEMBERS} currentUserId="not-in-list" />);
    expect(screen.queryByText("(you)")).not.toBeInTheDocument();
  });

  it("renders role badges for each member", () => {
    render(<TeamDirectory members={MEMBERS} currentUserId="other" />);
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(screen.getByText("Designer")).toBeInTheDocument();
  });

  it("renders the section heading", () => {
    render(<TeamDirectory members={MEMBERS} currentUserId="other" />);
    expect(screen.getByRole("heading", { name: /team members/i })).toBeInTheDocument();
  });

  it("renders an empty list without errors when members is empty", () => {
    render(<TeamDirectory members={[]} currentUserId="u1" />);
    expect(screen.getByRole("list", { name: /team members/i })).toBeInTheDocument();
    expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
  });
});
