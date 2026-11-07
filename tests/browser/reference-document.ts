import type { Page } from "@playwright/test";

// The pinned renderer uses VERCEL_URL=demo.react.email. An intercepted document
// at that origin also resolves original root-relative CSS artwork correctly.
// This synthetic URL is never fetched from the deployed React Email app.
export const reactEmailReferenceUrl = "https://demo.react.email/__puck_mjml_reference__.html";

export async function loadReactEmailReference(page: Page, html: string): Promise<void> {
  // Match only this document, not /static assets, stylesheets, or font requests.
  await page.route(reactEmailReferenceUrl, async (route) => {
    const request = route.request();
    if (
      !request.isNavigationRequest() ||
      request.resourceType() !== "document" ||
      request.frame() !== page.mainFrame()
    ) {
      await route.abort("blockedbyclient");
      return;
    }
    // Keep the renderer output unchanged: no URL rewriting or injected base tag.
    await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
  });
  await page.goto(reactEmailReferenceUrl, { waitUntil: "load", timeout: 30_000 });
}
