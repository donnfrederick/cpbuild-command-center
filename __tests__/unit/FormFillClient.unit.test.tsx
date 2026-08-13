/**
 * Unit tests for FormFillClient draft registration (leave-guard integration).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormTemplate } from "@/components/forms/formTypes";
import {
  FormFillClient,
  type FormFillDraftRegistration,
} from "@/components/forms/FormFillClient";
import { EMPTY_ANSWERS_MAP } from "@/lib/inspections/inspection-draft";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const TEMPLATE: FormTemplate = {
  id: "form-1",
  name: "Clear check",
  description: "",
  status: "published",
  level: "scope",
  scopeTypeCodes: ["CAB"],
  category: "CLEAR_INSPECTION",
  sections: [
    {
      id: "s1",
      title: "Items",
      questions: [
        {
          id: "q1",
          title: "Doors aligned?",
          description: "",
          responseType: "PASS_FAIL",
          required: false,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
      ],
    },
  ],
};

describe("FormFillClient draft registration", () => {
  it("registers dirty state when answers differ from baseline", async () => {
    const user = userEvent.setup();
    const draftRef: { current: FormFillDraftRegistration | null } = { current: null };
    const onDraftChange = vi.fn();

    render(
      <FormFillClient
        template={TEMPLATE}
        mode="live"
        dirtyBaseline={{}}
        draftRegistrationRef={draftRef}
        onDraftChange={onDraftChange}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(draftRef.current?.isDirty()).toBe(false);

    await user.click(screen.getByRole("button", { name: /passLabel/i }));

    expect(draftRef.current?.isDirty()).toBe(true);
    expect(onDraftChange).toHaveBeenCalled();
    expect(draftRef.current?.getAnswers().q1?.choice).toBe("pass");
  });

  it("YES_NO No and N/A use distinct active tones (not shared gray na styling)", async () => {
    const user = userEvent.setup();
    const yesNoTemplate: FormTemplate = {
      ...TEMPLATE,
      sections: [
        {
          id: "s1",
          title: "Section 1",
          questions: [
            {
              id: "q-yesno",
              title: "Is this a yes or no question?",
              description: "",
              responseType: "YES_NO",
              required: true,
              showNotApplicable: true,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
          ],
        },
      ],
    };

    render(
      <FormFillClient
        template={yesNoTemplate}
        mode="live"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const noBtn = screen.getByRole("button", { name: /noLabel/i });
    await user.click(noBtn);
    expect(noBtn).toHaveClass("is-active");
    expect(noBtn).toHaveClass("form-choice-btn--no");
    expect(noBtn).not.toHaveClass("form-choice-btn--na");

    const naBtn = screen.getByRole("button", { name: /naLabel/i });
    await user.click(naBtn);
    expect(naBtn).toHaveClass("is-active");
    expect(naBtn).toHaveClass("form-choice-btn--na");
    expect(naBtn).not.toHaveClass("form-choice-btn--no");
  });

  it("does not wipe answers when parent re-renders with a new empty initialAnswers reference", async () => {
    const user = userEvent.setup();
    const yesNoTemplate: FormTemplate = {
      ...TEMPLATE,
      sections: [
        {
          id: "s1",
          title: "Section 1",
          questions: [
            {
              id: "q-yesno",
              title: "Is this a yes or no question?",
              description: "",
              responseType: "YES_NO",
              required: true,
              showNotApplicable: true,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
          ],
        },
      ],
    };

    const revision = "live:project:unit:form-1:ver-1:new";

    const { rerender } = render(
      <FormFillClient
        template={yesNoTemplate}
        mode="live"
        initialAnswers={EMPTY_ANSWERS_MAP}
        initialAnswersRevision={revision}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const yesBtn = screen.getByRole("button", { name: /yesLabel/i });
    await user.click(yesBtn);
    expect(yesBtn).toHaveClass("is-active");

    rerender(
      <FormFillClient
        template={yesNoTemplate}
        mode="live"
        initialAnswers={{}}
        initialAnswersRevision={revision}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(yesBtn).toHaveClass("is-active");
  });

  it("re-hydrates answers when initialAnswersRevision changes (draft resume)", async () => {
    const user = userEvent.setup();
    const yesNoTemplate: FormTemplate = {
      ...TEMPLATE,
      sections: [
        {
          id: "s1",
          title: "Section 1",
          questions: [
            {
              id: "q-yesno",
              title: "Is this a yes or no question?",
              description: "",
              responseType: "YES_NO",
              required: true,
              showNotApplicable: false,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
          ],
        },
      ],
    };

    const { rerender } = render(
      <FormFillClient
        template={yesNoTemplate}
        mode="live"
        initialAnswers={EMPTY_ANSWERS_MAP}
        initialAnswersRevision="draft-key:new"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const yesBtn = screen.getByRole("button", { name: /yesLabel/i });
    await user.click(yesBtn);
    expect(yesBtn).toHaveClass("is-active");

    rerender(
      <FormFillClient
        template={yesNoTemplate}
        mode="live"
        initialAnswers={{ "q-yesno": { choice: "no" } }}
        initialAnswersRevision="draft-key:2026-06-18T12:00:00.000Z"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(yesBtn).not.toHaveClass("is-active");
    expect(screen.getByRole("button", { name: /noLabel/i })).toHaveClass("is-active");
  });

  it("shows optional comment field only when commentsEnabled is true on the question", async () => {
    const user = userEvent.setup();
    const withComments: FormTemplate = {
      ...TEMPLATE,
      sections: [
        {
          id: "s1",
          title: "Items",
          questions: [
            {
              ...TEMPLATE.sections[0]!.questions[0]!,
              id: "q-comment",
              commentsEnabled: true,
            },
          ],
        },
      ],
    };
    const withoutComments: FormTemplate = {
      ...withComments,
      sections: [
        {
          ...withComments.sections[0]!,
          questions: [
            {
              ...withComments.sections[0]!.questions[0]!,
              commentsEnabled: false,
            },
          ],
        },
      ],
    };

    const { rerender } = render(
      <FormFillClient template={withComments} mode="live" onSubmit={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.getByLabelText(/questionCommentLabel/i)).toBeInTheDocument();

    rerender(
      <FormFillClient template={withoutComments} mode="live" onSubmit={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.queryByLabelText(/questionCommentLabel/i)).not.toBeInTheDocument();

    rerender(
      <FormFillClient template={withComments} mode="live" onSubmit={vi.fn()} onClose={vi.fn()} />,
    );

    const commentBox = screen.getByLabelText(/questionCommentLabel/i);
    await user.type(commentBox, "Cabinet hinge misaligned");
    expect(screen.getByDisplayValue("Cabinet hinge misaligned")).toBeInTheDocument();
  });

  it("seeds required NUMBER with 0 in live mode when flag is on", () => {
    const draftRef: { current: FormFillDraftRegistration | null } = { current: null };
    const clearNumberTemplate: FormTemplate = {
      ...TEMPLATE,
      category: "CLEAR_INSPECTION",
      sections: [
        {
          id: "s1",
          title: "Materials",
          questions: [
            {
              id: "q-num",
              title: "Excess material on site? Please quantify:",
              description: "",
              responseType: "NUMBER",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
          ],
        },
      ],
    };

    render(
      <FormFillClient
        template={clearNumberTemplate}
        mode="live"
        seedClearInspectionNumberDefaults
        dirtyBaseline={{}}
        draftRegistrationRef={draftRef}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(draftRef.current?.getAnswers()["q-num"]?.number).toBe("0");
    expect(draftRef.current?.isDirty()).toBe(false);
    expect(screen.getByDisplayValue("0")).toBeInTheDocument();
  });

  it("does not seed NUMBER in preview mode when flag is off", () => {
    const clearNumberTemplate: FormTemplate = {
      ...TEMPLATE,
      category: "CLEAR_INSPECTION",
      sections: [
        {
          id: "s1",
          title: "Materials",
          questions: [
            {
              id: "q-num",
              title: "Excess material on site? Please quantify:",
              description: "",
              responseType: "NUMBER",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
          ],
        },
      ],
    };

    render(
      <FormFillClient
        template={clearNumberTemplate}
        mode="preview"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("0");
    expect(input).toHaveValue(null);
  });

  it("hides add-another-deficiency by default on PASS_FAIL_DEFICIENCIES fail", async () => {
    const user = userEvent.setup();
    const deficienciesTemplate: FormTemplate = {
      ...TEMPLATE,
      sections: [
        {
          id: "s1",
          title: "Items",
          questions: [
            {
              id: "q-def",
              title: "Cabinet install acceptable?",
              description: "",
              responseType: "PASS_FAIL_DEFICIENCIES",
              required: false,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
          ],
        },
      ],
    };

    render(
      <FormFillClient
        template={deficienciesTemplate}
        mode="live"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /failLabel/i }));

    expect(screen.queryByRole("button", { name: /addAnotherDeficiency/i })).not.toBeInTheDocument();
  });

  it("shows add-another-deficiency when allowAdditionalDeficiencies is true", async () => {
    const user = userEvent.setup();
    const deficienciesTemplate: FormTemplate = {
      ...TEMPLATE,
      sections: [
        {
          id: "s1",
          title: "Items",
          questions: [
            {
              id: "q-def",
              title: "Cabinet install acceptable?",
              description: "",
              responseType: "PASS_FAIL_DEFICIENCIES",
              required: false,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              allowAdditionalDeficiencies: true,
              options: [],
            },
          ],
        },
      ],
    };

    render(
      <FormFillClient
        template={deficienciesTemplate}
        mode="live"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /failLabel/i }));

    expect(screen.getByRole("button", { name: /addAnotherDeficiency/i })).toBeInTheDocument();
  });

  it("hides add-another-deficiency when allowAdditionalDeficiencies is false", async () => {
    const user = userEvent.setup();
    const lockedTemplate: FormTemplate = {
      ...TEMPLATE,
      sections: [
        {
          id: "s1",
          title: "Items",
          questions: [
            {
              id: "q-def",
              title: "Cabinet install acceptable?",
              description: "",
              responseType: "PASS_FAIL_DEFICIENCIES",
              required: false,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              allowAdditionalDeficiencies: false,
              options: [],
            },
          ],
        },
      ],
    };

    render(
      <FormFillClient
        template={lockedTemplate}
        mode="live"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /failLabel/i }));

    expect(screen.queryByRole("button", { name: /addAnotherDeficiency/i })).not.toBeInTheDocument();
  });

  it("adds a second deficiency row when allowAdditionalDeficiencies is true and add-another is clicked", async () => {
    const user = userEvent.setup();
    const deficienciesTemplate: FormTemplate = {
      ...TEMPLATE,
      sections: [
        {
          id: "s1",
          title: "Items",
          questions: [
            {
              id: "q-def",
              title: "Cabinet install acceptable?",
              description: "",
              responseType: "PASS_FAIL_DEFICIENCIES",
              required: false,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              deficiencyDescriptionEnabled: false,
              allowAdditionalDeficiencies: true,
              options: [],
            },
          ],
        },
      ],
    };

    render(
      <FormFillClient
        template={deficienciesTemplate}
        mode="live"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /failLabel/i }));
    await user.click(screen.getByRole("button", { name: "Minor" }));

    const addAnother = screen.getByRole("button", { name: /addAnotherDeficiency/i });
    await user.click(addAnother);

    expect(screen.getAllByRole("button", { name: /removeDeficiency/i })).toHaveLength(2);
  });
});
