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
    // A real modal participates in the browser's close-request handling. Keep
    // the rendered email's opaque-origin, script-disabled sandbox unchanged.
    const modal = dialog.tagName === "DIALOG" ? (dialog as HTMLDialogElement) : null;
    if (modal && !modal.open) modal.showModal();
    const controls = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), iframe:not([tabindex="-1"]), [tabindex="0"]',
        ),
      ].filter(
        (element) =>
          !element.closest("[hidden], [inert]") &&
          !element.hasAttribute("data-preview-focus-guard"),
      );
    const first = () => controls()[0] ?? dialog;
    const focusInside = () => first().focus({ preventScroll: true });
    let lastControl: HTMLElement | null = null;
    const view = document.defaultView;
    let focusTimer: number | undefined;
    // Keyboard events in an opaque-origin iframe cannot reach this document.
    // Preserve the sandbox and pointer interaction, but keep keyboard focus on
    // the preview controls. Only explicitly marked visual-preview frames opt in.
    const returnFromPreviewFrame = () => {
      if (focusTimer !== undefined) view?.clearTimeout(focusTimer);
      focusTimer = view?.setTimeout(() => {
        focusTimer = undefined;
        const active = document.activeElement;
        if (
          !dialog.isConnected ||
          !active?.matches("iframe[data-preview-keep-control-focus]") ||
          !dialog.contains(active)
        )
          return;
        const target = lastControl && controls().includes(lastControl) ? lastControl : first();
        target.focus({ preventScroll: true });
      }, 0);
    };
    const contain = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("iframe[data-preview-keep-control-focus]")) {
        returnFromPreviewFrame();
        return;
      }
      if (target && controls().includes(target)) lastControl = target;
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
    view?.addEventListener("blur", returnFromPreviewFrame);
    return () => {
      document.removeEventListener("focusin", contain);
      document.removeEventListener("keydown", cycle);
      view?.removeEventListener("blur", returnFromPreviewFrame);
      if (focusTimer !== undefined) view?.clearTimeout(focusTimer);
      if (modal?.open) modal.close();
      const target = restoreRef?.current ?? previous;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [open, ref, restoreRef]);
}
