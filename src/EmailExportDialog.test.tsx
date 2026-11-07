// @vitest-environment happy-dom
import { act, StrictMode, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailExportDialog } from "./EmailExportDialog";
import { compileEmail, toMjml } from "./export";
import { downloadEmailSource } from "./export-download";
import type { CompiledEmail, EmailDocument } from "./types";

vi.mock("./export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./export")>()),
  compileEmail: vi.fn(),
}));
vi.mock("./export-download", () => ({ downloadEmailSource: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const email = (subject: string): EmailDocument => ({
  root: { props: { subject, sections: [] } },
  content: [],
});
function pending() {
  let resolve!: (result: CompiledEmail) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<CompiledEmail>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const result = (html = "<!doctype html><html><body>Hello 👋</body></html>"): CompiledEmail => ({
  mjml: "<mjml><mj-body /></mjml>",
  html,
  errors: [],
});
let container: HTMLDivElement;
let root: Root;

function Host({
  document,
  allowRawHtml = false,
  allowLocalImages = false,
}: {
  document: EmailDocument;
  allowRawHtml?: boolean;
  allowLocalImages?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} onClick={() => setOpen(true)}>
        Open export
      </button>
      {open && (
        <EmailExportDialog
          document={document}
          allowRawHtml={allowRawHtml}
          allowLocalImages={allowLocalImages}
          restoreRef={ref}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
async function render(document: EmailDocument, options = {}) {
  await act(async () => root.render(<Host document={document} {...options} />));
}
const button = (text: string) =>
  [...container.querySelectorAll("button")].find((node) => node.textContent?.trim() === text)!;
const source = () => container.querySelector<HTMLTextAreaElement>("textarea")!;
const click = async (name: string) => act(async () => button(name).click());

beforeEach(() => {
  vi.mocked(compileEmail).mockReset();
  vi.mocked(downloadEmailSource).mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("email export dialog", () => {
  it("switches source formats during compilation and downloads the selected exact output", async () => {
    const request = pending();
    vi.mocked(compileEmail).mockReturnValue(request.promise);
    const document = email("Current email");
    await render(document);
    expect(container.querySelector("dialog")!.open).toBe(true);
    expect(button("HTML").getAttribute("aria-pressed")).toBe("true");
    expect(button("Download HTML").disabled).toBe(true);
    expect(source().getAttribute("aria-busy")).toBe("true");
    expect(container.textContent).toContain("Compiling HTML");
    await click("MJML");
    expect(source().value).toBe(toMjml(document));
    expect(source().readOnly).toBe(true);
    await click("Download MJML");
    expect(downloadEmailSource).toHaveBeenLastCalledWith("mjml", toMjml(document));
    const html =
      '<html><body><script>throw new Error("never execute")</script>Héllo 👋</body></html>';
    await act(async () =>
      request.resolve({ ...result(html), errors: [{ line: 2, message: "Warning example" }] }),
    );
    expect(button("MJML").getAttribute("aria-pressed")).toBe("true");
    expect(source().value).toBe(toMjml(document));
    expect(container.textContent).toContain("MJML warnings (1)");
    expect(container.textContent).toContain("Line 2: Warning example");
    await click("HTML");
    expect(source().value).toBe(html);
    expect(container.querySelector("script, iframe")).toBeNull();
    await click("Download HTML");
    expect(downloadEmailSource).toHaveBeenLastCalledWith("html", html);
    expect(container.textContent).toContain("Download started: email.html");
    expect(compileEmail).toHaveBeenCalledExactlyOnceWith(document, {
      allowRawHtml: false,
      allowLocalImages: false,
    });
  });

  it("invalidates old HTML immediately and ignores late results after a document replacement", async () => {
    const first = pending();
    const second = pending();
    const third = pending();
    vi.mocked(compileEmail)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    await render(email("First"));
    await act(async () => first.resolve(result("First HTML")));
    expect(source().value).toBe("First HTML");
    await render(email("Second"));
    expect(source().value).toBe("");
    expect(button("Download HTML").disabled).toBe(true);
    const latest = email("Third");
    await render(latest);
    await act(async () => third.resolve(result("Latest HTML")));
    await act(async () => second.resolve(result("Stale HTML")));
    expect(source().value).toBe("Latest HTML");
    await click("MJML");
    expect(source().value).toBe(toMjml(latest));
    await click("HTML");
    await click("Download HTML");
    expect(downloadEmailSource).toHaveBeenLastCalledWith("html", "Latest HTML");
  });

  it("ignores work from a dismissed modal and compiles fresh data when reopened", async () => {
    const dismissed = pending();
    const reopened = pending();
    vi.mocked(compileEmail)
      .mockReturnValueOnce(dismissed.promise)
      .mockReturnValueOnce(reopened.promise);
    await render(email("Before close"));
    await click("Close");
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(button("Open export"));
    await render(email("After close"));
    await click("Open export");
    await act(async () => dismissed.resolve(result("Dismissed HTML")));
    expect(source().value).toBe("");
    expect(button("Download HTML").disabled).toBe(true);
    await act(async () => reopened.resolve(result("Reopened HTML")));
    expect(source().value).toBe("Reopened HTML");
  });

  it("keeps MJML usable after HTML failure and supports retry", async () => {
    vi.mocked(compileEmail)
      .mockRejectedValueOnce(new Error("Compiler unavailable"))
      .mockResolvedValueOnce(result());
    const document = email("Retry");
    await render(document);
    expect(container.querySelector('[role="alert"]')!.textContent).toContain(
      "Compiler unavailable",
    );
    expect(button("Download HTML").disabled).toBe(true);
    await click("MJML");
    await click("Download MJML");
    expect(downloadEmailSource).toHaveBeenLastCalledWith("mjml", toMjml(document));
    await click("Retry HTML compilation");
    await click("HTML");
    expect(source().value).toBe(result().html);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("reports serialization errors without compiling or enabling either download", async () => {
    const invalid = email("Unsafe");
    invalid.root.props!.rawHead = "<script>alert(1)</script>";
    await render(invalid);
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Export failed:");
    expect(compileEmail).not.toHaveBeenCalled();
    expect(button("Download HTML").disabled).toBe(true);
    await click("MJML");
    expect(button("Download MJML").disabled).toBe(true);
  });

  it("invalidates compilation when host trust options change", async () => {
    const first = pending();
    const latest = pending();
    vi.mocked(compileEmail).mockReturnValueOnce(first.promise).mockReturnValueOnce(latest.promise);
    const document = email("Flags");
    await render(document);
    await render(document, { allowRawHtml: true, allowLocalImages: true });
    await act(async () => first.resolve(result("Old flags")));
    expect(button("Download HTML").disabled).toBe(true);
    expect(compileEmail).toHaveBeenLastCalledWith(document, {
      allowRawHtml: true,
      allowLocalImages: true,
    });
    await act(async () => latest.resolve(result("New flags")));
    expect(source().value).toBe("New flags");
  });

  it("reports download errors and allows another attempt without recompiling", async () => {
    vi.mocked(compileEmail).mockResolvedValue(result());
    vi.mocked(downloadEmailSource).mockImplementationOnce(() => {
      throw new Error("Downloads blocked");
    });
    await render(email("Download"));
    await click("Download HTML");
    expect(container.querySelector('[role="alert"]')!.textContent).toContain(
      "Download failed: Downloads blocked",
    );
    await click("Download HTML");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(compileEmail).toHaveBeenCalledOnce();
  });

  it.each(["Escape", "cancel", "backdrop"])(
    "closes by %s and restores keyboard focus",
    async (method) => {
      vi.mocked(compileEmail).mockResolvedValue(result());
      await render(email("Focus"));
      const dialog = container.querySelector("dialog")!;
      expect(dialog.contains(document.activeElement)).toBe(true);
      await act(async () => {
        if (method === "Escape")
          dialog.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
          );
        else if (method === "cancel")
          dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
        else dialog.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
      expect(container.querySelector("dialog")).toBeNull();
      expect(document.activeElement).toBe(button("Open export"));
    },
  );

  it("cancels backdrop mousedown without cancelling controls or source selection", async () => {
    vi.mocked(compileEmail).mockResolvedValue(result());
    await render(email("Backdrop focus"));
    const dialog = container.querySelector("dialog")!;
    for (const target of [button("MJML"), source()]) {
      const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      await act(async () => target.dispatchEvent(down));
      expect(down.defaultPrevented).toBe(false);
      expect(dialog.open).toBe(true);
      expect(dialog.isConnected).toBe(true);
    }
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => dialog.dispatchEvent(down));
    // Happy DOM does not apply native mousedown focus after the handler.
    // Cancellation prevents that action from undoing focus restoration.
    expect(down.defaultPrevented).toBe(true);
    expect(dialog.isConnected).toBe(false);
    expect(document.activeElement).toBe(button("Open export"));
  });

  it("contains Tab focus and stays open through StrictMode effect replay", async () => {
    vi.mocked(compileEmail).mockResolvedValue(result());
    await act(async () =>
      root.render(
        <StrictMode>
          <Host document={email("Strict mode")} />
        </StrictMode>,
      ),
    );
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    button("Close").focus();
    button("Close").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(button("Download HTML"));
    button("Download HTML").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(button("Close"));
  });
});
