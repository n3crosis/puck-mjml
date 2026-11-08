import { lazy, Suspense, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { EmailDocument } from "../src/types";
import "./compatibility/style.css";

const Compatibility = lazy(() =>
  import("./EmailCompatibility").then((module) => ({ default: module.EmailCompatibility })),
);

/** Keep the editor mounted when inspecting compatibility, preserving its history. */
export function DemoWorkspace({
  document,
  children,
}: {
  document: EmailDocument;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<"editor" | "compatibility">("editor");
  const [opened, setOpened] = useState(false);
  const id = useId();
  const editorTab = useRef<HTMLButtonElement>(null);
  const compatibilityTab = useRef<HTMLButtonElement>(null);
  const select = (next: typeof tab) => {
    setTab(next);
    if (next === "compatibility") setOpened(true);
  };
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: typeof tab;
    if (event.key === "Home") next = "editor";
    else if (event.key === "End") next = "compatibility";
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight")
      next = tab === "editor" ? "compatibility" : "editor";
    else return;
    event.preventDefault();
    select(next);
    (next === "editor" ? editorTab : compatibilityTab).current?.focus();
  };
  return (
    <div className="demo-workspace">
      <div
        className="demo-workspace-tabs"
        role="tablist"
        aria-label="Email workspace"
        onKeyDown={navigate}
      >
        <button
          ref={editorTab}
          type="button"
          role="tab"
          id={`${id}-editor-tab`}
          aria-controls={`${id}-editor`}
          aria-selected={tab === "editor"}
          tabIndex={tab === "editor" ? 0 : -1}
          onClick={() => select("editor")}
        >
          Editor
        </button>
        <button
          ref={compatibilityTab}
          type="button"
          role="tab"
          id={`${id}-compatibility-tab`}
          aria-controls={`${id}-compatibility`}
          aria-selected={tab === "compatibility"}
          tabIndex={tab === "compatibility" ? 0 : -1}
          onClick={() => select("compatibility")}
        >
          Compatibility
        </button>
      </div>
      <div
        className="demo-workspace-panel"
        role="tabpanel"
        id={`${id}-editor`}
        aria-labelledby={`${id}-editor-tab`}
        hidden={tab !== "editor"}
      >
        {children}
      </div>
      <div
        className="demo-workspace-panel demo-workspace-panel--compatibility"
        role="tabpanel"
        id={`${id}-compatibility`}
        aria-labelledby={`${id}-compatibility-tab`}
        hidden={tab !== "compatibility"}
        tabIndex={0}
      >
        {opened && (
          <Suspense
            fallback={
              <p role="status" className="compatibility">
                Loading compatibility checks…
              </p>
            }
          >
            <Compatibility document={document} active={tab === "compatibility"} allowLocalImages />
          </Suspense>
        )}
      </div>
    </div>
  );
}
