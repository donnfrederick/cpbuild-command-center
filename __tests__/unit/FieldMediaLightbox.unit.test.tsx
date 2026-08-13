import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import enMessages from "@/messages/en.json";
import { FieldMediaLightbox } from "@/components/shared/FieldMediaLightbox";

vi.mock("@/hooks/use-is-browser", () => ({
  useIsBrowser: () => true,
}));

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

const items = [
  { id: "a1", storageUrl: "https://storage.example.com/one.jpg", mimeType: "image/jpeg" },
  { id: "a2", storageUrl: "https://storage.example.com/two.jpg", mimeType: "image/jpeg" },
];

describe("FieldMediaLightbox", () => {
  it("renders the selected image in a dialog", () => {
    render(
      <Wrapper>
        <FieldMediaLightbox items={items} initialIndex={0} onClose={() => undefined} />
      </Wrapper>,
    );
    expect(screen.getByRole("dialog", { name: /photo viewer/i })).toBeInTheDocument();
    const img = document.querySelector('[role="dialog"] img');
    expect(img).toHaveAttribute("src", "https://storage.example.com/one.jpg");
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Wrapper>
        <FieldMediaLightbox items={items} initialIndex={0} onClose={onClose} />
      </Wrapper>,
    );

    await user.click(screen.getByRole("button", { name: /close photo/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("advances to the next image", async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <FieldMediaLightbox items={items} initialIndex={0} onClose={() => undefined} />
      </Wrapper>,
    );

    await user.click(screen.getByRole("button", { name: /next photo/i }));
    const img = document.querySelector('[role="dialog"] img');
    expect(img).toHaveAttribute("src", "https://storage.example.com/two.jpg");
  });
});
