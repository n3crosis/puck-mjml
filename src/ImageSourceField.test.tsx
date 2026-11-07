// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomField } from "@puckeditor/core";
import { ImageSourceField } from "./ImageSourceField";
import { createEmailConfig } from "./config";
import { PNG_IMAGE_SOURCE, pngImageBytes } from "../tests/fixtures/images";

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
async function choose(file = new File([pngImageBytes()], "image.png", { type: "image/png" })) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
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

describe("image uploads", () => {
  it("keeps URL-only hosts usable and exposes accessible upload progress", async () => {
    mount();
    const change = vi.fn();
    act(() => root.render(<ImageSourceField id="src" value="old" onChange={change} />));
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.querySelector('input[type="url"]')).not.toBeNull();
    let finish!: (value: string) => void;
    const upload = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    act(() =>
      root.render(<ImageSourceField id="src" value="old" onChange={change} upload={upload} />),
    );
    await choose();
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Uploading image…");
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')!.disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[type="url"]')!.readOnly).toBe(false);
    expect(container.querySelector('input[type="file"]')!.getAttribute("aria-label")).toBe(
      "Upload image",
    );
    await act(async () => finish("https://example.com/new.png"));
    expect(change).toHaveBeenCalledExactlyOnceWith("https://example.com/new.png");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("reports rejected uploads without changing the URL, then permits retrying the same file", async () => {
    mount();
    const change = vi.fn();
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error("Storage is unavailable"))
      .mockResolvedValueOnce("https://example.com/retry.png");
    act(() =>
      root.render(
        <ImageSourceField
          id="src"
          value="https://example.com/old.png"
          onChange={change}
          upload={upload}
        />,
      ),
    );
    const file = new File([pngImageBytes()], "image.png", { type: "image/png" });
    await choose(file);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Storage is unavailable");
    expect(container.querySelector('input[type="file"]')?.getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(container.querySelector<HTMLInputElement>('input[type="url"]')!.value).toBe(
      "https://example.com/old.png",
    );
    expect(change).not.toHaveBeenCalled();
    await choose(file);
    expect(change).toHaveBeenCalledExactlyOnceWith("https://example.com/retry.png");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it.each([
    "javascript:alert(1)",
    "blob:https://example.com/id",
    "https://user:pass@example.com/image.png",
    PNG_IMAGE_SOURCE,
    "not a URL",
  ])("rejects an invalid host result without a document change: %s", async (result) => {
    mount();
    const change = vi.fn();
    act(() =>
      root.render(
        <ImageSourceField id="src" value="old" onChange={change} upload={async () => result} />,
      ),
    );
    await choose();
    expect(change).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("HTTP or HTTPS");
  });

  it("accepts a bounded raster data URL only with explicit host opt-in", async () => {
    mount();
    const change = vi.fn();
    act(() =>
      root.render(
        <ImageSourceField
          id="src"
          value="old"
          onChange={change}
          upload={async () => PNG_IMAGE_SOURCE}
          allowLocalImages
        />,
      ),
    );
    await choose();
    expect(change).toHaveBeenCalledExactlyOnceWith(PNG_IMAGE_SOURCE);
    expect(container.textContent).toContain("not uploaded or hosted");
  });

  it("rejects invalid selected files before calling the host", async () => {
    mount();
    const upload = vi.fn();
    const change = vi.fn();
    act(() =>
      root.render(<ImageSourceField id="src" value="old" onChange={change} upload={upload} />),
    );
    await choose(new File(["<svg/>"], "image.png", { type: "image/png" }));
    expect(upload).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("valid PNG");
  });

  it("drops a late completion after manual typing and a newer upload", async () => {
    mount();
    const finish: ((value: string) => void)[] = [];
    const upload = () => new Promise<string>((resolve) => finish.push(resolve));
    const change = vi.fn();
    act(() =>
      root.render(<ImageSourceField id="src" value="old" onChange={change} upload={upload} />),
    );
    await choose();
    const input = container.querySelector<HTMLInputElement>('input[type="url"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "https://example.com/manual.png",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(change).toHaveBeenLastCalledWith("https://example.com/manual.png");
    await choose();
    await act(async () => finish[0]("https://example.com/stale.png"));
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => finish[1]("https://example.com/latest.png"));
    expect(change.mock.calls).toEqual([
      ["https://example.com/manual.png"],
      ["https://example.com/latest.png"],
    ]);
  });

  it.each(["upload disabled", "local permission removed"])(
    "drops a pending result after %s",
    async (reason) => {
      mount();
      let finish!: (value: string) => void;
      const upload = () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        });
      const change = vi.fn();
      act(() =>
        root.render(
          <ImageSourceField
            id="src"
            value="old"
            onChange={change}
            upload={upload}
            allowLocalImages
          />,
        ),
      );
      await choose();
      act(() =>
        root.render(
          <ImageSourceField
            id="src"
            value="old"
            onChange={change}
            upload={reason === "upload disabled" ? undefined : upload}
            allowLocalImages={false}
          />,
        ),
      );
      await act(async () => finish(PNG_IMAGE_SOURCE));
      expect(change).not.toHaveBeenCalled();
      expect(container.querySelector('[role="alert"]')).toBeNull();
    },
  );
});

describe("upload validation races", () => {
  it.each(["lock", "replacement", "unmount"])(
    "does not start host upload if %s occurs during validation",
    async (reason) => {
      mount();
      const file = new File([pngImageBytes()], "image.png", { type: "image/png" });
      let read!: (buffer: ArrayBuffer) => void;
      vi.spyOn(file, "arrayBuffer").mockImplementation(
        () =>
          new Promise((resolve) => {
            read = resolve;
          }),
      );
      const upload = vi.fn().mockResolvedValue("https://example.com/upload.png");
      const change = vi.fn();
      const field = (value = "old", readOnly = false) => (
        <ImageSourceField
          id="src"
          value={value}
          readOnly={readOnly}
          onChange={change}
          upload={upload}
        />
      );
      act(() => root.render(field()));
      await choose(file);
      act(() =>
        root.render(
          reason === "unmount"
            ? null
            : field(reason === "replacement" ? "new" : "old", reason === "lock"),
        ),
      );
      await act(async () => read(pngImageBytes().buffer));
      expect(upload).not.toHaveBeenCalled();
      expect(change).not.toHaveBeenCalled();
    },
  );
  it("ignores an older rejection while a newer upload is running", async () => {
    mount();
    let rejectOld!: (cause: Error) => void;
    let resolveNew!: (url: string) => void;
    const upload = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectOld = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNew = resolve;
          }),
      );
    const change = vi.fn();
    act(() =>
      root.render(<ImageSourceField id="src" value="old" onChange={change} upload={upload} />),
    );
    await choose();
    act(() =>
      root.render(<ImageSourceField id="src" value="newer" onChange={change} upload={upload} />),
    );
    await choose();
    await act(async () => rejectOld(new Error("Stale failure")));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => resolveNew("https://example.com/newest.png"));
    expect(change).toHaveBeenCalledExactlyOnceWith("https://example.com/newest.png");
  });
});
