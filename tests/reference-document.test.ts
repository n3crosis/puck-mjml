import type { Page, Route } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { loadReactEmailReference, reactEmailReferenceUrl } from "./browser/reference-document";

function browserStub() {
  const frame = {};
  let handler: (route: Route) => Promise<void>;
  const request = {
    isNavigationRequest: () => true,
    resourceType: () => "document",
    frame: () => frame,
  };
  const route = {
    request: () => request,
    fulfill: vi.fn(async (_options: { body: string; status: number; contentType: string }) => {}),
    abort: vi.fn(async () => {}),
  };
  const page = {
    mainFrame: () => frame,
    route: vi.fn(async (_url: string, callback: typeof handler) => {
      handler = callback;
    }),
    goto: vi.fn(async () => {
      await handler(route as unknown as Route);
    }),
  };
  return { page, route, request };
}

describe("unchanged React Email reference document origin", () => {
  it("registers one exact synthetic document route before navigation, not a wildcard", async () => {
    const { page, route } = browserStub();
    await loadReactEmailReference(page as unknown as Page, "<!doctype html><p>Original</p>");
    expect(page.route).toHaveBeenCalledExactlyOnceWith(
      reactEmailReferenceUrl,
      expect.any(Function),
    );
    expect(page.goto).toHaveBeenCalledExactlyOnceWith(reactEmailReferenceUrl, {
      waitUntil: "load",
      timeout: 30_000,
    });
    expect(page.route.mock.invocationCallOrder[0]).toBeLessThan(
      page.goto.mock.invocationCallOrder[0],
    );
    expect(route.fulfill).toHaveBeenCalledOnce();
    expect(route.abort).not.toHaveBeenCalled();
    expect(reactEmailReferenceUrl).toBe("https://demo.react.email/__puck_mjml_reference__.html");
    expect(new URL("/static/raycast-bg.png", reactEmailReferenceUrl).href).toBe(
      "https://demo.react.email/static/raycast-bg.png",
    );
    expect(new URL("static/example.png", reactEmailReferenceUrl).href).toBe(
      "https://demo.react.email/static/example.png",
    );
  });

  it("fulfills the exact original payload including relative URLs, entities, and whitespace", async () => {
    const { page, route } = browserStub();
    const html =
      '<!doctype html>\r\n<html><head></head><body style="background-image:url(\'/static/raycast-bg.png\')">\n<!-- Original -->🪄&amp;\u00a0<img src="/static/logo.png"></body></html>\n';
    await loadReactEmailReference(page as unknown as Page, html);
    expect(route.fulfill).toHaveBeenCalledExactlyOnceWith({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: html,
    });
  });

  it("preserves every pinned reference's original bytes and SHA-256 through fulfillment", async () => {
    const directory = new URL("./fixtures/react-email-reference/", import.meta.url);
    const manifest: { templates: { html: string; bytes: number; sha256: string }[] } = JSON.parse(
      readFileSync(new URL("manifest.json", directory), "utf8"),
    );
    expect(manifest.templates).toHaveLength(62);
    for (const reference of manifest.templates) {
      const { page, route } = browserStub();
      const bytes = readFileSync(new URL(reference.html, directory));
      await loadReactEmailReference(page as unknown as Page, bytes.toString("utf8"));
      const payload = Buffer.from(route.fulfill.mock.calls[0][0].body, "utf8");
      expect(payload, reference.html).toEqual(bytes);
      expect(payload.byteLength, reference.html).toBe(reference.bytes);
      expect(createHash("sha256").update(payload).digest("hex"), reference.html).toBe(
        reference.sha256,
      );
    }
  });

  it.each(["non-navigation", "subresource", "child frame"])(
    "does not serve the reference HTML to a matching URL used as a %s request",
    async (kind) => {
      const { page, route, request } = browserStub();
      if (kind === "non-navigation") request.isNavigationRequest = () => false;
      if (kind === "subresource") request.resourceType = () => "image";
      if (kind === "child frame") request.frame = () => ({});
      await loadReactEmailReference(page as unknown as Page, "original");
      expect(route.abort).toHaveBeenCalledExactlyOnceWith("blockedbyclient");
      expect(route.fulfill).not.toHaveBeenCalled();
    },
  );

  it("does not navigate if the interception cannot be installed", async () => {
    const { page } = browserStub();
    page.route.mockRejectedValueOnce(new Error("Cannot install document route"));
    await expect(loadReactEmailReference(page as unknown as Page, "original")).rejects.toThrow(
      "Cannot install document route",
    );
    expect(page.goto).not.toHaveBeenCalled();
  });
});
