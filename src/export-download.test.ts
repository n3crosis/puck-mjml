// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadEmailSource } from "./export-download";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("local source downloads", () => {
  it.each([
    ["html", "text/html;charset=utf-8"],
    ["mjml", "application/xml;charset=utf-8"],
  ] as const)(
    "downloads exact UTF-8 %s bytes with the right filename and MIME",
    async (format, mime) => {
      const source = "<source>Héllo 👋 &amp; world</source>\n";
      const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export-test");
      const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        expect(this.isConnected).toBe(true);
        expect(this.download).toBe(`email.${format}`);
        expect(this.href).toBe("blob:export-test");
      });
      downloadEmailSource(format, source);
      expect(click).toHaveBeenCalledOnce();
      const blob = create.mock.calls[0][0] as Blob;
      expect(blob.type).toBe(mime);
      expect(await blob.text()).toBe(source);
      expect(document.querySelector("a[download]")).toBeNull();
      expect(revoke).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(revoke).toHaveBeenCalledWith("blob:export-test");
    },
  );

  it("cleans up the link and Blob immediately if the download cannot start", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:failed-export");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("Downloads are blocked");
    });
    expect(() => downloadEmailSource("html", "<html></html>")).toThrow("Downloads are blocked");
    expect(document.querySelector("a[download]")).toBeNull();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:failed-export");
    expect(vi.getTimerCount()).toBe(0);
  });
});
