"use client";

/**
 * Shared bottom-sheet primitive for the form-driven inspection flow.
 *
 * Mirrors `ScopeFieldBottomSheet` in `components/projects/UnitCards.tsx`
 * (same CSS, same portal pattern, same z-index stack above the mobile
 * unit detail modal) but lives as its own module so the new inspection
 * components don't have to reach into UnitCards' internals — and so
 * the primitive can eventually absorb both usages once the scope-card
 * refactor lands.
 */

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { useIsBrowser } from "@/hooks/use-is-browser";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

/** Fill overlay (InspectionFillOverlay) — above scope sheet (270) and sync strip (280). */
export const INSPECTION_FILL_OVERLAY_Z_INDEX = 450;

/** Resume-draft and leave-guard dialogs — must stack above the fill overlay. */
export const INSPECTION_OVERLAY_DIALOG_Z_INDEX = 460;

/** Shared CSS for stacked scope/inspection pickers.
 *  Mobile: slides up from the bottom.
 *  Desktop (≥640 px): centered modal with a fixed max-width. */
export const INSPECTION_SHEET_CSS = `
  /* ── shared backdrop ── */
  .ibs-backdrop { position: fixed; inset: 0; z-index: 270; display: flex; align-items: flex-end; justify-content: center; transition: background-color 0.26s ease; }

  /* ── mobile: full-width bottom sheet ── */
  .ibs-sheet { width: 100%; max-height: 85vh; border-radius: 16px 16px 0 0; background: var(--neutral-0); transform: translateY(105%); transition: transform 0.3s cubic-bezier(0.32,0.72,0,1); display: flex; flex-direction: column; box-shadow: 0 -4px 32px rgba(0,0,0,0.14); padding-bottom: env(safe-area-inset-bottom, 0px); }
  .ibs-sheet.ibs-visible { transform: translateY(0); }
  .ibs-handle { width: 36px; height: 4px; background: var(--neutral-300); border-radius: 99px; margin: 10px auto 0; flex-shrink: 0; }

  /* ── desktop: centered dialog ── */
  @media (min-width: 640px) {
    .ibs-backdrop { align-items: center; }
    .ibs-sheet { width: 560px; max-width: calc(100vw - 48px); max-height: min(640px, 90vh); border-radius: 16px; transform: scale(0.96) translateY(8px); opacity: 0; transition: transform 0.22s cubic-bezier(0.32,0.72,0,1), opacity 0.22s ease; box-shadow: 0 8px 40px rgba(0,0,0,0.22); padding-bottom: 0; }
    .ibs-sheet.ibs-visible { transform: scale(1) translateY(0); opacity: 1; }
    .ibs-handle { display: none; }
  }
`;


/**
 * A bottom sheet that slides up from below. Dismissed by tapping the
 * backdrop, pressing Escape, or using the close button. Children are
 * rendered inside a scrolling body.
 */
export function InspectionBottomSheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const tCommon = useTranslations("common");
  const isBrowser = useIsBrowser();
  const titleId = useId();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const finishClose = useCallback(() => {
    setVisible(false);
    window.setTimeout(onClose, 260);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finishClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finishClose]);

  if (!isBrowser) return null;

  return createPortal(
    <>
      <style>{INSPECTION_SHEET_CSS}</style>
      <div
        role="presentation"
        className="ibs-backdrop"
        style={{
          backgroundColor: visible ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0)",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) finishClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`ibs-sheet${visible ? " ibs-visible" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ibs-handle" aria-hidden />
          <div
            style={{
              padding: "12px 20px 14px",
              borderBottom: "1px solid var(--neutral-200)",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h2
                  id={titleId}
                  style={{
                    margin: 0,
                    fontSize: 17,
                    fontWeight: 700,
                    color: "var(--neutral-900)",
                  }}
                >
                  {title}
                </h2>
                {subtitle ? (
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 13,
                      color: "var(--neutral-500)",
                      lineHeight: 1.35,
                    }}
                  >
                    {subtitle}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={finishClose}
                aria-label={tCommon("close")}
                style={{
                  padding: 6,
                  borderRadius: 8,
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  color: "var(--neutral-500)",
                  flexShrink: 0,
                }}
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              paddingBottom: "max(32px, env(safe-area-inset-bottom, 0px))",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
