import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import enMessages from "@/messages/en.json";
import { ActivityMediaStrip } from "@/components/shared/ActivityMediaStrip";

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

describe("ActivityMediaStrip", () => {
  it("renders nothing when metadata has no previews", () => {
    const { container } = render(
      <Wrapper>
        <ActivityMediaStrip metadata={{}} />
      </Wrapper>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders image thumbnails from hydrated metadata", () => {
    render(
      <Wrapper>
        <ActivityMediaStrip
          metadata={{
            mediaPreviews: [
              {
                id: "att1",
                storageUrl: "https://storage.example.com/photo.jpg",
                mimeType: "image/jpeg",
              },
            ],
          }}
        />
      </Wrapper>,
    );
    const img = document.querySelector("img");
    expect(img).toHaveAttribute("src", "https://storage.example.com/photo.jpg");
  });

  it("opens a lightbox dialog when a thumbnail is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <ActivityMediaStrip
          metadata={{
            mediaPreviews: [
              {
                id: "att1",
                storageUrl: "https://storage.example.com/photo.jpg",
                mimeType: "image/jpeg",
              },
            ],
          }}
        />
      </Wrapper>,
    );

    await user.click(screen.getByRole("button", { name: /view photo/i }));

    expect(screen.getByRole("dialog", { name: /photo viewer/i })).toBeInTheDocument();
    const lightboxImg = document.querySelector('[role="dialog"] img');
    expect(lightboxImg).toHaveAttribute("src", "https://storage.example.com/photo.jpg");
  });
});
