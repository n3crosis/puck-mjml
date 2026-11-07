import { beforeEach, vi } from "vitest";
import { withDefaultFontFixtures } from "./fixtures/font-css";

const nativeFetch = globalThis.fetch.bind(globalThis);

beforeEach(() => {
  if (typeof window === "undefined" || !("happyDOM" in window)) return;
  // Runs before each file's own hooks, so font-specific tests can replace this
  // fixture with their delayed/failing fetches. Reinstall after local resets.
  vi.stubGlobal("fetch", withDefaultFontFixtures(nativeFetch));
});
