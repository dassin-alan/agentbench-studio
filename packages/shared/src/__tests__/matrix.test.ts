import { describe, expect, it } from "vitest";
import { aggregateRequirementStatus, buildRequirementMatrix } from "../matrix";
import type { ProjectResult, Requirement, TestCase } from "../types";

describe("requirement matrix", () => {
  it("keeps requirements without tests as untested", () => {
    expect(aggregateRequirementStatus([])).toBe("untested");
  });

  it("returns partial when linked tests are mixed", () => {
    expect(aggregateRequirementStatus(["passed", "failed"])).toBe("partial");
    expect(aggregateRequirementStatus(["passed", "passed"])).toBe("passed");
    expect(aggregateRequirementStatus(["failed", "failed"])).toBe("failed");
  });

  it("links requirements, test outcomes and screenshot evidence", () => {
    const requirements: Requirement[] = [
      { id: "REQ-001", title: "Search", priority: "must" },
      { id: "REQ-002", title: "Mobile", priority: "should" }
    ];
    const testCases: TestCase[] = [{
      id: "TEST-001",
      name: "Search",
      requirementId: "REQ-001",
      critical: true,
      steps: [{ action: "goto", path: "/" }]
    }];
    const project = (projectId: string, status: "passed" | "failed"): ProjectResult => ({
      projectId,
      status: status === "passed" ? "passed" : "partial",
      startup: { status: "passed", durationMs: 100 },
      baseChecks: { accessible: true, httpOk: true, hasTitle: true, hasVisibleContent: true, blankPage: false, severeErrorCount: 0 },
      testCases: [{
        testCaseId: "TEST-001",
        requirementId: "REQ-001",
        status,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
        durationMs: 1000,
        steps: [],
        screenshots: [`artifacts/${projectId}/screenshots/search.png`],
        logs: []
      }],
      browserLogs: [],
      requestFailures: [],
      responsive: [],
      metrics: { testDurationMs: 1000 },
      artifacts: []
    });

    const matrix = buildRequirementMatrix(requirements, testCases, [project("project-a", "passed"), project("project-b", "failed")]);

    expect(matrix[0]?.projectA.status).toBe("passed");
    expect(matrix[0]?.projectB.status).toBe("failed");
    expect(matrix[0]?.projectA.evidence[0]).toContain("search.png");
    expect(matrix[1]?.projectA.status).toBe("untested");
  });
});
