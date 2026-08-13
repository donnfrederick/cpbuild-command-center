import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/forms/formsApi", () => ({
  listForms: vi.fn().mockResolvedValue([]),
  createForm: vi.fn(),
  deleteForm: vi.fn(),
  saveFormDraft: vi.fn(),
}));

import { FormsPageClient } from "@/components/forms/FormsPageClient";

const messages = {
  forms: {
    pageTitle: "Form Builder",
    title: "Form Builder",
    subtitle: "Inspection forms",
    searchPlaceholder: "Search forms",
    emptyState: "No forms",
    newForm: "New form",
    setup: {
      title: "Setup",
      close: "Close",
      purposeDocumentation: "Documentation",
      purposeInspection: "Inspection",
      defaultDocumentationFormName: "New doc form",
    },
    list: {
      levelProject: "Project",
      levelUnit: "Unit",
      levelScope: "Scope",
    },
  },
  common: {
    loading: "Loading",
  },
};

function renderPage(props: { canManageForms?: boolean } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FormsPageClient canManageForms={props.canManageForms ?? true} />
    </NextIntlClientProvider>,
  );
}

describe("FormsPageClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ canonicalScopeTypes: [] }),
    }) as unknown as typeof fetch;
  });

  it("renders the Form Builder title without Issue setup tabs", async () => {
    renderPage({ canManageForms: true });
    expect(await screen.findByText("Form Builder")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Issue setup" })).not.toBeInTheDocument();
  });
});
