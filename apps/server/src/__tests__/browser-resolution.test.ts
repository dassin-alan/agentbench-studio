import { describe, expect, it } from "vitest";
import { browserExecutableCandidates } from "../playwright/browser-runner";

describe("browser executable resolution", () => {
  it("prioritizes PLAYWRIGHT_EXECUTABLE_PATH and de-duplicates fallback paths", () => {
    const candidates = browserExecutableCandidates({ PLAYWRIGHT_EXECUTABLE_PATH: "D:\\Browsers\\chromium.exe" }, "win32");
    expect(candidates[0]).toBe("D:\\Browsers\\chromium.exe");
    expect(candidates).toContain("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    expect(candidates).toContain("C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe");
    expect(new Set(candidates).size).toBe(candidates.length);
  });
});

