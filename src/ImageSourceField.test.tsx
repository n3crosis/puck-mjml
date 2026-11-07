// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomField } from "@puckeditor/core";
import { ImageSourceField } from "./ImageSourceField";
import { createEmailConfig } from "./config";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});
function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
}
async function choose() {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [new File(["image"], "image.png", { type: "image/png" })],
  });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
describe("image source permissions and pending uploads", () => {
  it("passes source readOnly through the real custom field and blocks uploads", async () => {
    mount();
    const upload = vi.fn().mockResolvedValue("https://example.com/new.png");
    const change = vi.fn();
    const field = createEmailConfig(upload).components.Image.fields!.src as CustomField<string>;
    if (field.type !== "custom") throw new Error("Expected custom image field");
    act(() =>
      root.render(
        field.render({
          id: "image_src",
          name: "src",
          field,
          value: "https://example.com/old.png",
          onChange: change,
          readOnly: true,
        }),
      ),
    );
    expect(container.querySelector<HTMLInputElement>('input[type="url"]')!.readOnly).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')!.disabled).toBe(true);
    await choose();
    expect(upload).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
  });
  it.each(["external update", "permission change", "selection change", "unmount"])(
    "ignores an upload after %s",
    async (reason) => {
      mount();
      let finish!: (value: string) => void;
      const upload = () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        });
      const change = vi.fn();
      const view = (value = "old", readOnly = false, id = "image_src") => (
        <ImageSourceField
          key={id}
          id={id}
          value={value}
          readOnly={readOnly}
          upload={upload}
          onChange={change}
        />
      );
      act(() => root.render(view()));
      await choose();
      act(() =>
        root.render(
          reason === "unmount"
            ? null
            : view(
                reason === "external update" ? "new" : "old",
                reason === "permission change",
                reason === "selection change" ? "other_src" : "image_src",
              ),
        ),
      );
      await act(async () => finish("https://example.com/upload.png"));
      expect(change).not.toHaveBeenCalled();
    },
  );
  it("uses the latest callback when the host rerenders without changing the source", async () => {
    mount();
    let finish!: (value: string) => void;
    const upload = () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      });
    const old = vi.fn();
    const latest = vi.fn();
    act(() =>
      root.render(<ImageSourceField id="src" value="old" upload={upload} onChange={old} />),
    );
    await choose();
    act(() =>
      root.render(<ImageSourceField id="src" value="old" upload={upload} onChange={latest} />),
    );
    await act(async () => finish("https://example.com/upload.png"));
    expect(old).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith("https://example.com/upload.png");
  });
});
