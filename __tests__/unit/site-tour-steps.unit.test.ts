import { describe, it, expect } from "vitest";
import { SITE_TOUR_STEPS, type LocalizedString } from "@/lib/site-tour-steps";

function isLocalized(s: LocalizedString): boolean {
  return typeof s.en === "string" && s.en.trim().length > 0 &&
         typeof s.es === "string" && s.es.trim().length > 0;
}

describe("SITE_TOUR_STEPS", () => {
  it("has at least 10 steps", () => {
    expect(SITE_TOUR_STEPS.length).toBeGreaterThanOrEqual(10);
  });

  it("has exactly 10 steps (wizard compressed to 1 step, upload sim on units page, 2026-03)", () => {
    expect(SITE_TOUR_STEPS.length).toBe(10);
  });

  it("every step has all required fields populated with both EN and ES content", () => {
    for (const step of SITE_TOUR_STEPS) {
      expect(typeof step.order, `step ${step.order} — order`).toBe("number");
      expect(step.pageUrl.trim(), `step ${step.order} — pageUrl`).not.toBe("");
      expect(isLocalized(step.title), `step ${step.order} — title must have non-empty en and es`).toBe(true);
      expect(isLocalized(step.description), `step ${step.order} — description must have non-empty en and es`).toBe(true);
      expect(isLocalized(step.voiceText), `step ${step.order} — voiceText must have non-empty en and es`).toBe(true);
    }
  });

  it("every step's EN and ES title/description are distinct (not the same string)", () => {
    for (const step of SITE_TOUR_STEPS) {
      expect(
        step.title.en !== step.title.es,
        `step ${step.order} — title.en and title.es should differ`
      ).toBe(true);
    }
  });

  it("elementSelector is always a string (may be empty for full-page steps)", () => {
    for (const step of SITE_TOUR_STEPS) {
      expect(typeof step.elementSelector, `step ${step.order} — elementSelector`).toBe("string");
    }
  });

  it("order values are unique and contiguous starting from 1", () => {
    const orders = SITE_TOUR_STEPS.map((s) => s.order).sort((a, b) => a - b);
    expect(orders[0]).toBe(1);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]).toBe(orders[i - 1] + 1);
    }
  });

  it("all pageUrls are locale-agnostic root-relative paths", () => {
    for (const step of SITE_TOUR_STEPS) {
      expect(
        step.pageUrl.startsWith("/") && !step.pageUrl.startsWith("/en/") && !step.pageUrl.startsWith("/es/"),
        `step ${step.order} — pageUrl "${step.pageUrl}" must be a locale-agnostic path starting with "/" (no /en/ or /es/ prefix)`
      ).toBe(true);
    }
  });

  it("dispatch autoInteract steps have an eventName", () => {
    for (const step of SITE_TOUR_STEPS) {
      if (step.autoInteract?.type === "dispatch") {
        expect(
          step.autoInteract.eventName,
          `step ${step.order} — dispatch autoInteract must have an eventName`
        ).toBeTruthy();
      }
    }
  });

  it("step 5 clicks the Add Project button; step 6 dispatches the full wizard; step 7 dispatches the upload sim", () => {
    const step5 = SITE_TOUR_STEPS.find((s) => s.order === 5);
    const step6 = SITE_TOUR_STEPS.find((s) => s.order === 6);
    const step7 = SITE_TOUR_STEPS.find((s) => s.order === 7);

    expect(step5?.autoInteract?.type).toBe("click");

    expect(step6?.autoInteract?.type).toBe("dispatch");
    expect(step6?.autoInteract?.eventName).toBe("tour:run-full-wizard-no-upm");
    expect(step6?.autoInteract?.cleanupOnLeave).toBe("escape");

    expect(step7?.autoInteract?.type).toBe("dispatch");
    expect(step7?.autoInteract?.eventName).toBe("tour:simulate-field-tracker-upload");
    expect(step7?.pageUrl).toContain("{{PROJECT_ID}}/units");
  });

  it("does NOT include any admin-only pages (/users)", () => {
    const adminSteps = SITE_TOUR_STEPS.filter((s) => s.pageUrl.includes("/users"));
    expect(adminSteps.length).toBe(0);
  });

  it("step 8 covers feedback and notifications (EN), not team management", () => {
    const step8 = SITE_TOUR_STEPS.find((s) => s.order === 8);
    expect(step8).toBeDefined();
    expect(step8!.pageUrl).toBe("/");
    // Should NOT reference team/invite actions
    expect(step8!.description.en.toLowerCase()).not.toMatch(/\b(invite|team directory)\b/);
    // Should reference feedback or notifications
    expect(
      step8!.description.en.toLowerCase().includes("feedback") ||
      step8!.description.en.toLowerCase().includes("notif") ||
      step8!.description.en.toLowerCase().includes("bug")
    ).toBe(true);
  });

  it("step 8 covers feedback and notifications (ES), not team management", () => {
    const step8 = SITE_TOUR_STEPS.find((s) => s.order === 8);
    expect(step8).toBeDefined();
    expect(step8!.description.es.toLowerCase()).not.toMatch(/\b(invite|team directory)\b/);
    expect(
      step8!.description.es.toLowerCase().includes("retroalimentaci") ||
      step8!.description.es.toLowerCase().includes("notif") ||
      step8!.description.es.toLowerCase().includes("error")
    ).toBe(true);
  });
});
