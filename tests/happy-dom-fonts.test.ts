// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";

const url = "https://fonts.googleapis.com/css?family=Ubuntu:300,400,500,700";

afterEach(() => vi.unstubAllGlobals());

it("lets a test replace the default fixture with its own failing fetch", async () => {
  expect(await (await fetch(url)).text()).toContain('font-family: "Ubuntu"');
  const ownFetch = vi.fn(async () => new Response("failure", { status: 503 }));
  vi.stubGlobal("fetch", ownFetch);
  expect((await fetch(url)).status).toBe(503);
  expect(ownFetch).toHaveBeenCalledExactlyOnceWith(url);
});

it("reinstalls deterministic default CSS after the previous test resets its mock", async () => {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('src: local("puck-mjml-unit-test-font")');
});
