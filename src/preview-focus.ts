import { useEffect, type RefObject } from "react";

/** Keep keyboard interaction in the preview, then restore the invoking control. */
export function usePreviewFocus(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  restoreRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const document = dialog.ownerDocument;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), iframe, [tabindex="0"]',
        ),
      ].filter(
        (element) =>
          !element.closest("[hidden], [inert]") &&
          !element.hasAttribute("data-preview-focus-guard"),
      );
    const first = () => controls()[0] ?? dialog;
    const focusInside = () => first().focus({ preventScroll: true });
    const contain = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.dataset?.previewFocusGuard === "start")
        (controls().at(-1) ?? dialog).focus({ preventScroll: true });
      else if (target?.dataset?.previewFocusGuard === "end" || (target && !dialog.contains(target)))
        focusInside();
    };
    const cycle = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = controls();
      const index = elements.indexOf(document.activeElement as HTMLElement);
      if (index < 0 || (event.shiftKey ? index === 0 : index === elements.length - 1)) {
        event.preventDefault();
        (event.shiftKey ? (elements.at(-1) ?? dialog) : first()).focus({ preventScroll: true });
      }
    };
    focusInside();
    document.addEventListener("focusin", contain);
    document.addEventListener("keydown", cycle);
    return () => {
      document.removeEventListener("focusin", contain);
      document.removeEventListener("keydown", cycle);
      const target = restoreRef?.current ?? previous;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [open, ref, restoreRef]);
}
