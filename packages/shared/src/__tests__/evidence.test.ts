import { describe, expect, it } from "vitest";
import { evidenceForRequirement, globalEvidenceForProject } from "../evidence";
import type { ProjectResult } from "../types";

const project: ProjectResult = {
  projectId: "project-a",
  status: "partial",
  startup: { status: "passed", durationMs: 10 },
  baseChecks: { accessible: true, httpOk: true, hasTitle: true, hasVisibleContent: true, blankPage: false, severeErrorCount: 0 },
  testCases: [
    { testCaseId: "TEST-1", requirementId: "REQ-1", status: "passed", startedAt: "x", completedAt: "y", durationMs: 1, viewport: "desktop", steps: [], screenshots: ["artifacts/test-1.png"], logs: [{ type: "warning", message: "one", timestamp: "x", testCaseId: "TEST-1" }], requestFailures: [], critical: false },
    { testCaseId: "TEST-2", requirementId: "REQ-2", status: "failed", startedAt: "x", completedAt: "y", durationMs: 1, viewport: "desktop", steps: [], screenshots: ["artifacts/test-2.png"], logs: [{ type: "error", message: "two", timestamp: "x", testCaseId: "TEST-2" }], requestFailures: [{ url: "/api/two", method: "GET", reason: "failed", resourceType: "fetch", timestamp: "x", testCaseId: "TEST-2" }], critical: false }
  ],
  browserLogs: [{ type: "pageerror", message: "base", timestamp: "x" }],
  requestFailures: [], responsive: [], metrics: { testDurationMs: 2 },
  artifacts: [
    { id: "base", projectId: "project-a", type: "screenshot", relativePath: "artifacts/base.png", label: "BASE", testCaseId: "BASE" },
    { id: "one", projectId: "project-a", type: "screenshot", relativePath: "artifacts/test-1.png", label: "one", testCaseId: "TEST-1" }
  ]
};

describe("evidence attribution", () => {
  it("does not expose another test's logs or failures in the current requirement", () => {
    const evidence = evidenceForRequirement(project, ["TEST-1"]);
    expect(evidence.logs.map((item) => item.message)).toEqual(["one"]);
    expect(evidence.requestFailures).toHaveLength(0);
    expect(evidence.artifacts.map((item) => item.relativePath)).toEqual(["artifacts/test-1.png"]);
  });

  it("keeps BASE screenshots in global evidence instead of every requirement", () => {
    expect(evidenceForRequirement(project, ["TEST-1"]).artifacts.some((item) => item.testCaseId === "BASE")).toBe(false);
    expect(globalEvidenceForProject(project).artifacts.some((item) => item.testCaseId === "BASE")).toBe(true);
  });
});
