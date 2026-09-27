import { describe, expect, it } from "vitest";
import { resolveTestViewports } from "../playwright/browser-runner";
import type { TestCase } from "@agentbench/shared";

const testCase = (viewports: NonNullable<TestCase["viewports"]>): TestCase => ({
  id: "TEST-NOT-REQ-005",
  name: "explicit viewport",
  requirementId: "REQ-999",
  critical: false,
  viewports,
  steps: [{ action: "expectVisible", selector: "main" }]
});

describe("explicit test viewports", () => {
  it("runs a non REQ-005 test on mobile", () => {
    expect(resolveTestViewports(testCase(["mobile"]), true)).toEqual(["mobile"]);
  });

  it("runs the same test once on desktop and once on mobile", () => {
    expect(resolveTestViewports(testCase(["desktop", "mobile"]), true)).toEqual(["desktop", "mobile"]);
  });
});
