import { useEffect } from "react";
import { createUsePuck } from "@puckeditor/core";

const usePuck = createUsePuck();

export function RawHtmlPolicy({ enabled }: { enabled: boolean }) {
  const visible = usePuck((state) => state.appState.ui.componentList.Advanced?.visible);
  const dispatch = usePuck((state) => state.dispatch);

  useEffect(() => {
    if (visible === enabled) return;
    // Puck initializes categories once; keep the policy current after changes and undo.
    dispatch({
      type: "setUi",
      recordHistory: false,
      ui: (previous) => ({
        componentList: {
          ...previous.componentList,
          Advanced: {
            ...previous.componentList.Advanced,
            components: ["Raw"],
            visible: enabled,
          },
        },
      }),
    });
  }, [dispatch, enabled, visible]);

  return null;
}
