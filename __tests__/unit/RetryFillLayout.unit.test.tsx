/**
 * Unit tests for components/projects/inspections/RetryFillLayout.tsx
 *
 * Uses the real buildRetryTemplate so we exercise the full integration
 * between the utility and the component (no mock needed for pure functions).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => {
  const inspections: Record<string, string | ((v: Record<string, unknown>) => string)> = {
    retryAttemptLabel: (v) => `Attempt #${v.n}`,
    retryOpenDeficiencies: "Open deficiencies",
    retryReviewRemaining: "Review remaining items",
    retryPreviousAnswer: "Previous answer",
    retryResolved: "Resolved",
    retryStillFailing: "Still failing",
    retryUpdateDeficiency: "Update deficiency",
    retryAddAnotherDeficiency: "Add another deficiency",
    retryAdditionalDeficiency: "Additional deficiency",
    retryDescribeStillFailing: "Describe what's still failing…",
    retryDescribeDeficiency: "Describe the deficiency…",
    retryDocumentDeficiency: "Document what's failing",
    retryCompleteBeforeSubmit: "Complete the new deficiency details before submitting.",
    retryCompleteResolutionBeforeSubmit: "Submit a resolution for each resolved deficiency before submitting the attempt.",
    retryResolveEachDeficiency: "Mark each deficiency as Resolved or Still failing before submitting.",
    retryUnresolvedDeficiencyCount: (v) =>
      `${v.count} ${v.count === 1 ? "deficiency still needs" : "deficiencies still need"} a resolution`,
    retrySubmitResolution: "Submit resolution",
    retryResolutionSubmitted: "Resolution submitted",
    deficiencyCountDisplay: (v) =>
      v.count === 1 ? "1 deficiency" : `${v.count} deficiencies`,
    retryDocumentResolution: "Document resolution",
    retryResolutionNotePlaceholder: "Describe how this was fixed…",
    retryResolutionNoteLabel: "Resolution note",
    retrySubmitAttempt: (v) => `Submit Attempt #${v.n}`,
    retrySubmitting: "Submitting…",
    retryOccurrences: "Occurrences",
    retryAddPhoto: "Add a photo",
    retryAddMorePhotos: "Add more",
    retryDecreaseCount: "Decrease count",
    retryIncreaseCount: "Increase count",
    retryRemoveDeficiency: "Remove this deficiency",
    passLabel: "Pass",
    failLabel: "Fail",
    naLabel: "N/A",
    yesLabel: "Yes",
    noLabel: "No",
    emptyAnswerDash: "—",
    noSeverityRecorded: "No severity recorded",
  };
  const formsFill: Record<string, string | ((v: Record<string, unknown>) => string)> = {
    documentDeficienciesIntro: "Document each deficiency below for this failed item",
    deficiencyDescPlaceholder: "Describe the deficiency…",
    deficiencyCountLabel: "Occurrences",
    decreaseCount: "Decrease count",
    increaseCount: "Increase count",
    pickSeverity: "Pick a severity",
    pickSeverityToContinue: "Pick a severity to continue",
    addPhoto: "Add a photo",
    addPhotoToContinue: "Add a photo to continue",
    addPhotoButton: "Add photo / video / audio",
    addMoreMedia: "Add more media",
    addAnotherDeficiency: "Add another deficiency",
    removeDeficiency: "Remove this deficiency",
    deficiencyLabel: (v) => `Deficiency ${v.n}`,
    describeDeficiencyToContinue: "Describe the deficiency to continue",
    submitBlockedDefDesc: "a description",
    submitBlockedDefSeverity: "a severity",
    submitBlockedDefPhoto: "a photo",
    submitBlockedConnector: " and ",
    addDeficiencyIncompleteHint: (v) => `Add ${v.what} for the current deficiency before adding another`,
  };
  const common: Record<string, string> = { close: "Close" };
  return {
    useTranslations: (ns?: string) => (key: string, values?: Record<string, unknown>) => {
      const map =
        ns === "common"
          ? common
          : ns === "forms.fill"
            ? formsFill
            : inspections;
      const entry = map[key];
      if (typeof entry === "function") return entry(values ?? {});
      if (entry) return entry;
      return key;
    },
  };
});

vi.mock("@/components/projects/CameraCapture", () => ({
  CameraCapture: () => null,
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { RetryFillLayout } from "@/components/projects/inspections/RetryFillLayout";
import { buildRetryTemplate, type AnswersMap } from "@/lib/inspections/retryUtils";
import type { FormTemplate } from "@/components/forms/formTypes";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_TEMPLATE: FormTemplate = {
  id: "form-1",
  name: "Clear Inspection — CAB",
  description: "",
  status: "published",
  level: "scope",
  category: "CLEAR_INSPECTION",
  scopeTypeCodes: ["CAB"],
  sections: [
    {
      id: "s1",
      title: "General",
      questions: [
        {
          id: "q1",
          title: "Cabinet doors flush?",
          description: "",
          responseType: "PASS_FAIL",
          required: true,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
        {
          id: "q2",
          title: "Hardware installed?",
          description: "",
          responseType: "PASS_FAIL",
          required: true,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
      ],
    },
  ],
};

// q1 failed, q2 passed — buildRetryTemplate promotes q1 to the deficiency
// section and leaves q2 in the remaining section.
const PREVIOUS_ANSWERS_WITH_FAIL: AnswersMap = {
  q1: { choice: "fail" },
  q2: { choice: "pass" },
};

const RETRY_RESULT = buildRetryTemplate(BASE_TEMPLATE, PREVIOUS_ANSWERS_WITH_FAIL);
const RETRY_TEMPLATE = RETRY_RESULT.template;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProps(
  overrides: Partial<React.ComponentProps<typeof RetryFillLayout>> = {},
): React.ComponentProps<typeof RetryFillLayout> {
  return {
    template: RETRY_TEMPLATE,
    previousAnswers: PREVIOUS_ANSWERS_WITH_FAIL,
    questionSectionMap: RETRY_RESULT.questionSectionMap,
    attemptNumber: 2,
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RetryFillLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the attempt number in the header", () => {
    render(<RetryFillLayout {...makeProps()} />);
    expect(screen.getByText("Attempt #2")).toBeInTheDocument();
  });

  it("renders the form name as hero title when location is unavailable", () => {
    render(<RetryFillLayout {...makeProps()} />);
    expect(
      screen.getByRole("heading", { name: /Clear Inspection — CAB/i }),
    ).toBeInTheDocument();
  });

  it("shows unit as hero title and building/level in the location line", () => {
    render(
      <RetryFillLayout
        {...makeProps({
          locationParts: { building: "1", level: "3", unit: "303" },
        })}
      />,
    );
    expect(screen.getByText("Bldg 1 · Level 3")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Unit 303" })).toBeInTheDocument();
  });

  it("renders the deficiencies section heading as auto-expanded", () => {
    render(<RetryFillLayout {...makeProps()} />);
    expect(screen.getByText("Open deficiencies")).toBeInTheDocument();
    // q1 is in the deficiency section and visible immediately (auto-expanded)
    expect(screen.getByText("Cabinet doors flush?")).toBeInTheDocument();
  });

  it("renders the remaining items section heading", () => {
    render(<RetryFillLayout {...makeProps()} />);
    expect(screen.getByText("Review remaining items")).toBeInTheDocument();
  });

  it("submit button is disabled when deficiencies are not yet resolved", () => {
    render(<RetryFillLayout {...makeProps()} />);
    const submitBtn = screen.getByRole("button", { name: /Submit Attempt #2/i });
    expect(submitBtn).toBeDisabled();
  });

  it("submit button becomes enabled after marking all deficiencies as resolved with notes", async () => {
    const user = userEvent.setup();
    render(<RetryFillLayout {...makeProps()} />);

    await user.click(screen.getByRole("button", { name: /Resolved/i }));
    expect(screen.getByRole("button", { name: /Submit Attempt #2/i })).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("Describe how this was fixed…"),
      "Doors adjusted and aligned",
    );
    expect(screen.getByRole("button", { name: /Submit Attempt #2/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Submit resolution/i }));

    expect(screen.getByRole("button", { name: /Submit Attempt #2/i })).not.toBeDisabled();
  });

  it("calls onSubmit with resolvedDeficiencies when deficiencies are resolved", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<RetryFillLayout {...makeProps({ onSubmit })} />);

    await user.click(screen.getByRole("button", { name: /Resolved/i }));
    await user.type(
      screen.getByPlaceholderText("Describe how this was fixed…"),
      "Fixed cabinet alignment",
    );
    await user.click(screen.getByRole("button", { name: /Submit resolution/i }));
    await user.click(screen.getByRole("button", { name: /Submit Attempt #2/i }));

    expect(onSubmit).toHaveBeenCalledOnce();
    const submitted = onSubmit.mock.calls[0]![0] as AnswersMap;
    expect(submitted.q1?.choice).toBe("pass");
    expect(submitted.q1?.resolvedDeficiencies).toHaveLength(1);
    expect(submitted.q1?.resolvedDeficiencies?.[0]?.resolutionNote).toBe(
      "Fixed cabinet alignment",
    );
  });

  it("calls onSubmit when submit button is clicked after resolving all deficiencies", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<RetryFillLayout {...makeProps({ onSubmit })} />);

    await user.click(screen.getByRole("button", { name: /Resolved/i }));
    await user.type(
      screen.getByPlaceholderText("Describe how this was fixed…"),
      "Fixed",
    );
    await user.click(screen.getByRole("button", { name: /Submit resolution/i }));
    await user.click(screen.getByRole("button", { name: /Submit Attempt #2/i }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("keeps submit disabled for still-failing deficiency questions until details are complete", async () => {
    const user = userEvent.setup();
    const template: FormTemplate = {
      ...BASE_TEMPLATE,
      sections: [
        {
          ...BASE_TEMPLATE.sections[0],
          questions: [
            {
              ...BASE_TEMPLATE.sections[0].questions[0],
              responseType: "PASS_FAIL_DEFICIENCIES",
            },
          ],
        },
      ],
    };
    const answers: AnswersMap = {
      q1: {
        choice: "fail",
        deficiencies: [
          { id: "d-prev", description: "Door is chipped", count: 1 },
        ],
      },
    };
    const retryResult = buildRetryTemplate(template, answers);

    render(
      <RetryFillLayout
        template={retryResult.template}
        previousAnswers={answers}
        questionSectionMap={retryResult.questionSectionMap}
        attemptNumber={2}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Still failing/i }));
    const submitBtn = screen.getByRole("button", { name: /Submit Attempt #2/i });
    expect(submitBtn).toBeDisabled();
    expect(
      screen.getByText("Complete the new deficiency details before submitting."),
    ).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("Describe what's still failing…"),
      "Door still chipped",
    );
    await user.click(screen.getByRole("button", { name: "Minor" }));

    expect(submitBtn).not.toBeDisabled();
  });

  it("requires each deficiency grouping to be resolved before submit", async () => {
    const user = userEvent.setup();
    const template: FormTemplate = {
      ...BASE_TEMPLATE,
      sections: [
        {
          ...BASE_TEMPLATE.sections[0],
          questions: [
            {
              ...BASE_TEMPLATE.sections[0].questions[0],
              responseType: "PASS_FAIL_DEFICIENCIES",
            },
          ],
        },
      ],
    };
    const answers: AnswersMap = {
      q1: {
        choice: "fail",
        deficiencies: [
          { id: "d1", description: "Quality issue", severity: "Major", count: 1 },
          { id: "d2", description: "Missing parts", severity: "Major", count: 1 },
        ],
      },
    };
    const retryResult = buildRetryTemplate(template, answers);

    render(
      <RetryFillLayout
        template={retryResult.template}
        previousAnswers={answers}
        questionSectionMap={retryResult.questionSectionMap}
        attemptNumber={4}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    const submitBtn = screen.getByRole("button", { name: /Submit Attempt #4/i });
    expect(submitBtn).toBeDisabled();

    const resolvedButtons = screen.getAllByRole("button", { name: /Resolved/i });
    expect(resolvedButtons).toHaveLength(2);

    await user.click(resolvedButtons[0]!);
    expect(submitBtn).toBeDisabled();

    await user.type(
      screen.getAllByPlaceholderText("Describe how this was fixed…")[0]!,
      "Quality issue fixed",
    );
    await user.click(screen.getAllByRole("button", { name: /Submit resolution/i })[0]!);

    await user.click(resolvedButtons[1]!);
    expect(submitBtn).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("Describe how this was fixed…"),
      "Parts installed",
    );
    await user.click(screen.getByRole("button", { name: /Submit resolution/i }));

    expect(submitBtn).not.toBeDisabled();
  });

  it("shows one resolution row per unique deficiency with occurrence count", async () => {
    const template: FormTemplate = {
      ...BASE_TEMPLATE,
      sections: [
        {
          ...BASE_TEMPLATE.sections[0],
          questions: [
            {
              ...BASE_TEMPLATE.sections[0].questions[0],
              responseType: "PASS_FAIL_DEFICIENCIES",
            },
          ],
        },
      ],
    };
    const answers: AnswersMap = {
      q1: {
        choice: "fail",
        deficiencies: [
          { id: "d1", description: "test description", severity: "Major", count: 4 },
        ],
      },
    };
    const retryResult = buildRetryTemplate(template, answers);

    render(
      <RetryFillLayout
        template={retryResult.template}
        previousAnswers={answers}
        questionSectionMap={retryResult.questionSectionMap}
        attemptNumber={2}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: /Resolved/i })).toHaveLength(1);
    expect(screen.getAllByText("test description")).toHaveLength(1);
    expect(screen.getByText("×4")).toBeInTheDocument();
    expect(screen.getAllByText("1 deficiency").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RetryFillLayout {...makeProps({ onClose })} />);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("expanding Review remaining items reveals the non-failed question", async () => {
    const user = userEvent.setup();
    render(<RetryFillLayout {...makeProps()} />);

    // Initially collapsed — the non-failed question is not visible.
    // Click the "Review remaining items" heading to expand it.
    await user.click(screen.getByText("Review remaining items"));

    expect(screen.getByText("Hardware installed?")).toBeInTheDocument();
  });

  it("opens deficiency capture when a previously passed item is marked fail", async () => {
    const user = userEvent.setup();
    const template: FormTemplate = {
      ...BASE_TEMPLATE,
      sections: [
        {
          id: "s1",
          title: "Appliances",
          questions: [
            {
              id: "q1",
              title: "Cabinet doors flush?",
              description: "",
              responseType: "PASS_FAIL_DEFICIENCIES",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
            {
              id: "q2",
              title: "Hardware installed?",
              description: "",
              responseType: "PASS_FAIL_DEFICIENCIES",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
          ],
        },
      ],
    };
    const answers: AnswersMap = {
      q1: { choice: "fail", deficiencies: [{ id: "d1", description: "Gap at hinge", severity: "Major", count: 1 }] },
      q2: { choice: "pass" },
    };
    const retryResult = buildRetryTemplate(template, answers);

    render(
      <RetryFillLayout
        template={retryResult.template}
        previousAnswers={answers}
        questionSectionMap={retryResult.questionSectionMap}
        attemptNumber={2}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Resolved/i }));
    await user.type(
      screen.getByPlaceholderText("Describe how this was fixed…"),
      "Doors adjusted",
    );
    await user.click(screen.getByRole("button", { name: /Submit resolution/i }));

    await user.click(screen.getByText("Review remaining items"));

    const failButtons = screen.getAllByRole("button", { name: /^Fail$/i });
    await user.click(failButtons[failButtons.length - 1]!);

    expect(
      screen.getByText("Document each deficiency below for this failed item"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Describe the deficiency…"),
    ).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: /Submit Attempt #2/i });
    expect(submitBtn).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("Describe the deficiency…"),
      "Missing hardware on upper cabinets",
    );
    await user.click(screen.getByRole("button", { name: "Minor" }));

    expect(submitBtn).not.toBeDisabled();
  });

  it("enables submit immediately when there are no deficiency questions", () => {
    // A template with no failed answers → buildRetryTemplate returns it unchanged.
    // Passing it directly means deficiencySection is absent → allResolved is vacuously true.
    const allPassAnswers: AnswersMap = {
      q1: { choice: "pass" },
      q2: { choice: "pass" },
    };
    const noDefResult = buildRetryTemplate(BASE_TEMPLATE, allPassAnswers);

    render(
      <RetryFillLayout
        template={noDefResult.template}
        questionSectionMap={noDefResult.questionSectionMap}
        previousAnswers={allPassAnswers}
        attemptNumber={3}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Submit Attempt #3/i })).not.toBeDisabled();
  });

  it("registers retry draft state and reports dirty after resolution change", async () => {
    const user = userEvent.setup();
    const draftRef = { current: null as import("@/lib/inspections/inspection-draft").RetryDraftRegistration | null };
    const onDraftChange = vi.fn();
    const answers: AnswersMap = {
      q1: { choice: "fail", deficiencies: [{ id: "d1", description: "Gap", severity: "Major", count: 1 }] },
      q2: { choice: "pass" },
    };
    const retryResult = buildRetryTemplate(BASE_TEMPLATE, answers);

    render(
      <RetryFillLayout
        template={retryResult.template}
        previousAnswers={answers}
        questionSectionMap={retryResult.questionSectionMap}
        attemptNumber={2}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
        draftRegistrationRef={draftRef}
        onDraftChange={onDraftChange}
      />,
    );

    expect(draftRef.current?.isDirty()).toBe(false);

    await user.click(screen.getByRole("button", { name: /Resolved/i }));

    expect(draftRef.current?.isDirty()).toBe(true);
    expect(onDraftChange).toHaveBeenCalled();
    expect(Object.keys(draftRef.current?.getRetryState().resolutions).length).toBeGreaterThan(0);
  });
});
