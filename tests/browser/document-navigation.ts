// Playwright runs Chromium on the host OS. Text editors use different keys
// for the document boundaries on macOS and on Linux/Windows.
export const documentStart = process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home";
export const documentEnd = process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End";
