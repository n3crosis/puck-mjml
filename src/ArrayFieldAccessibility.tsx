import { useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

const scopeSelector = "[data-pm-array-field]";
const summarySelector = '[class*="_ArrayFieldItem-summary_"]';

/**
 * Compatibility seam for Puck 0.24's native array fields. Its icon-only Add
 * button has no name, and its clickable summaries only have pointer sensors.
 * Keep those components, refs, and data/history handlers; add missing semantics
 * within this field instance only. Revisit these selectors when upgrading Puck.
 */
export function ArrayFieldAccessibility({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const instanceId = useId();
  const nextBodyId = useRef(0);
  const spaceTarget = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const scope = ref.current;
    if (!scope) return;
    const owns = (element: Element) => element.closest(scopeSelector) === scope;
    const synchronize = () => {
      for (const button of scope.querySelectorAll<HTMLButtonElement>(
        'button[class*="_ArrayField-addButton_"]',
      )) {
        if (!owns(button)) continue;
        // Leave an upstream/custom accessible name alone. Track ours so a
        // renamed field can update it without touching any nested array.
        if (
          !button.hasAttribute("aria-labelledby") &&
          (button.hasAttribute("data-pm-array-add") ||
            (!button.getAttribute("aria-label") && !button.title && !button.textContent?.trim()))
        ) {
          button.setAttribute("aria-label", `Add item to ${label}`);
          button.setAttribute("data-pm-array-add", "");
        }
      }
      for (const summary of scope.querySelectorAll<HTMLElement>(summarySelector)) {
        if (!owns(summary)) continue;
        const body = summary.nextElementSibling;
        if (
          !body?.matches('[class*="_ArrayFieldItem-body_"]') ||
          summary.parentElement?.matches('[class*="_ArrayFieldItem--noFields_"]')
        ) {
          summary.removeAttribute("data-pm-array-disclosure");
          summary.removeAttribute("aria-expanded");
          summary.removeAttribute("aria-controls");
          continue;
        }
        if (!body.id) body.id = `${instanceId}-array-body-${nextBodyId.current++}`;
        summary.setAttribute("data-pm-array-disclosure", "");
        summary.setAttribute("aria-controls", body.id);
        summary.setAttribute("aria-expanded", String(Boolean(body.firstElementChild)));
        // A locked array cannot be reordered, but its contents can still be
        // inspected. The disclosure is not an editing action.
        summary.setAttribute("role", "button");
        if (summary.tabIndex !== 0) summary.tabIndex = 0;
        if (summary.hasAttribute("aria-disabled")) summary.removeAttribute("aria-disabled");
      }
    };
    synchronize();
    const observer = new MutationObserver(synchronize);
    // Native expansion updates classes/fieldsets. The drag ref also updates
    // disabled/tabindex after effects; only change those when necessary so
    // observing them cannot create a feedback loop.
    observer.observe(scope, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-disabled", "tabindex"],
    });
    return () => {
      observer.disconnect();
      spaceTarget.current = null;
    };
  }, [instanceId, label]);

  const disclosure = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    return !event.defaultPrevented &&
      !event.nativeEvent.isComposing &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      target.matches("[data-pm-array-disclosure]") &&
      target.closest(scopeSelector) === event.currentTarget &&
      target.getAttribute("aria-grabbed") !== "true"
      ? target
      : null;
  };

  return (
    <div
      ref={ref}
      data-pm-array-field={label}
      onKeyDown={(event) => {
        const target = disclosure(event);
        if (!target || event.key !== " ") spaceTarget.current = null;
        // Bubble after native handlers so future handled drag keys win. Never
        // activate from an input, CodeMirror, or a nested action button.
        if (!target || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        if (event.repeat) return;
        if (event.key === "Enter") target.click();
        else spaceTarget.current = target;
      }}
      onKeyUp={(event) => {
        if (event.key !== " ") return;
        const target = disclosure(event);
        const armed = spaceTarget.current;
        spaceTarget.current = null;
        if (target && target === armed) {
          event.preventDefault();
          target.click();
        }
      }}
      onBlur={() => {
        spaceTarget.current = null;
      }}
    >
      {children}
    </div>
  );
}
