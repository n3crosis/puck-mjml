import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  blocksPlugin,
  createUsePuck,
  fieldsPlugin,
  outlinePlugin,
  type Plugin,
} from "@puckeditor/core";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import type { EmailDocument } from "../src/types";
import "./compatibility/style.css";

const Compatibility = lazy(() =>
  import("./EmailCompatibility").then((module) => ({ default: module.EmailCompatibility })),
);
const usePuck = createUsePuck();
const panelNames = ["blocks", "outline", "compatibility", "fields"] as const;
type PanelName = (typeof panelNames)[number];
const WorkspaceContext = createContext<{
  document: EmailDocument;
  id: string;
  buttons: Map<string, HTMLButtonElement>;
} | null>(null);
function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Demo plugins require DemoWorkspace.");
  return context;
}
function usePanelActive(name: PanelName) {
  return usePuck(
    (state) =>
      state.appState.ui.leftSideBarVisible &&
      (state.appState.ui.plugin.current ?? "blocks") === name,
  );
}

/** Native plugin navigation, with actual keyboard-operable buttons in Puck's public icon slot. */
function PluginButton({ name, label, icon }: { name: PanelName; label: string; icon: ReactNode }) {
  const { id, buttons } = useWorkspace();
  const active = usePanelActive(name);
  const dispatch = usePuck((state) => state.dispatch);
  const open = (next: PanelName, visible = true) =>
    dispatch({
      type: "setUi",
      ui: { plugin: { current: next }, leftSideBarVisible: visible },
      recordHistory: false,
    });
  const navigate = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.nativeEvent.isComposing) return;
    const names: readonly PanelName[] = window.matchMedia("(max-width: 637px)").matches
      ? panelNames
      : panelNames.slice(0, 3);
    const index = names.indexOf(name);
    let next: PanelName;
    if (event.key === "Home") next = names[0]!;
    else if (event.key === "End") next = names[names.length - 1]!;
    else if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = names[(index + 1) % names.length]!;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = names[(index + names.length - 1) % names.length]!;
    else return;
    event.preventDefault();
    event.stopPropagation();
    open(next);
    buttons.get(next)?.focus();
  };
  return (
    <button
      type="button"
      className="demo-plugin-button"
      ref={(element) => {
        if (element) buttons.set(name, element);
        else buttons.delete(name);
      }}
      aria-label={label}
      aria-pressed={active}
      aria-controls={`${id}-${name}`}
      onKeyDown={navigate}
      onClick={(event) => {
        event.stopPropagation();
        open(name, !active);
      }}
    >
      {icon}
    </button>
  );
}

function PluginPanel({
  name,
  label,
  children,
}: {
  name: PanelName;
  label: string;
  children: ReactNode;
}) {
  const { id, buttons } = useWorkspace();
  const active = usePanelActive(name);
  const dispatch = usePuck((state) => state.dispatch);
  return (
    <section
      id={`${id}-${name}`}
      className={`demo-plugin-panel demo-plugin-panel--${name}`}
      aria-label={`${label} panel`}
      hidden={!active}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing)
          return;
        event.preventDefault();
        event.stopPropagation();
        dispatch({ type: "setUi", ui: { leftSideBarVisible: false }, recordHistory: false });
        buttons.get(name)?.focus();
      }}
    >
      {children}
    </section>
  );
}

function CompatibilityPanel() {
  const { document } = useWorkspace();
  const active = usePanelActive("compatibility");
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (active) setOpened(true);
  }, [active]);
  return (
    <PluginPanel name="compatibility" label="Compatibility">
      {opened && (
        <Suspense
          fallback={
            <p role="status" className="compatibility">
              Loading compatibility checks…
            </p>
          }
        >
          <Compatibility document={document} active={active} allowLocalImages debounceMs={200} />
        </Suspense>
      )}
    </PluginPanel>
  );
}

function accessiblePlugin(plugin: Plugin, name: PanelName, label: string): Plugin {
  const Render = plugin.render!;
  return {
    ...plugin,
    icon: <PluginButton name={name} label={label} icon={plugin.icon} />,
    render: () => (
      <PluginPanel name={name} label={label}>
        <Render />
      </PluginPanel>
    ),
  };
}

// Stable identities keep Puck renderers and undo state intact on every host echo.
// Factories retain Puck's own Blocks/Outline/Fields renderers and mobile rules.
export const demoWorkspacePlugins: Plugin[] = [
  accessiblePlugin(blocksPlugin(), "blocks", "Blocks"),
  accessiblePlugin(outlinePlugin(), "outline", "Outline"),
  {
    name: "compatibility",
    label: "Compatibility",
    icon: (
      <PluginButton
        name="compatibility"
        label="Compatibility"
        icon={<ShieldCheckIcon aria-hidden="true" />}
      />
    ),
    render: CompatibilityPanel,
  },
  accessiblePlugin(fieldsPlugin(), "fields", "Fields"),
];

/** Supplies the current email to the native sidebar plugin, without replacing Puck's layout. */
export function DemoWorkspace({
  document,
  children,
}: {
  document: EmailDocument;
  children: ReactNode;
}) {
  const id = useId();
  const buttons = useRef(new Map<string, HTMLButtonElement>()).current;
  const value = useMemo(() => ({ document, id, buttons }), [document, id, buttons]);
  return (
    <WorkspaceContext.Provider value={value}>
      <div className="demo-workspace">{children}</div>
    </WorkspaceContext.Provider>
  );
}
