import { describe, expect, it } from "vitest";
import { generateDecision } from "../conclusions";
import type { ProjectResult, RequirementMatrixEntry, ScoreBreakdown } from "../types";

const score = (total: number): ScoreBreakdown => ({
  total,
  requirementCompletion: total,
  requirementCoverage: 100,
  criticalInteractions: total,
  stability: total,
  performance: total,
  performanceEstimated: false,
  responsive: total,
  accessibility: total,
  baseQuality: total,
  evidenceCoverage: 100,
  unexecutedChecks: []
});

const result = (projectId: string, testStatus: "passed" | "failed"): ProjectResult => ({
  projectId,
  status: testStatus === "passed" ? "passed" : "partial",
  startup: { status: "passed", durationMs: 100 },
  baseChecks: { accessible: true, httpOk: true, hasTitle: true, hasVisibleContent: true, blankPage: false, severeErrorCount: 0 },
  testCases: [{ testCaseId: "TEST-001", requirementId: "REQ-001", status: testStatus, startedAt: "x", completedAt: "y", durationMs: 10, steps: [{ index: 1, action: "click", selector: "[data-testid=submit]", status: testStatus, durationMs: 5, viewport: "desktop", ...(testStatus === "failed" ? { error: "element not found", screenshot: "artifacts/failure.png" } : {}) }], screenshots: testStatus === "failed" ? ["artifacts/failure.png"] : [], logs: [], critical: true }],
  browserLogs: testStatus === "failed" ? [{ type: "error", message: "render crashed", timestamp: "x" }] : [],
  requestFailures: testStatus === "failed" ? [{ url: "http://127.0.0.1/api", method: "GET", reason: "net::ERR_FAILED", resourceType: "fetch", timestamp: "x" }] : [],
  responsive: [], metrics: { testDurationMs: 10 }, artifacts: []
});

describe("rule based decision", () => {
  it("recommends the stronger project with evidence-backed reasons and remediation prompt", () => {
    const matrix: RequirementMatrixEntry[] = [{
      requirement: { id: "REQ-001", title: "Search works", priority: "must" },
      testCaseIds: ["TEST-001"],
      projectA: { status: "failed", evidence: ["artifacts/failure.png"] },
      projectB: { status: "failed", evidence: [] }
    }];
    const decision = generateDecision(
      [result("project-a", "failed"), result("project-b", "failed")],
      { "project-a": score(92), "project-b": score(55) },
      matrix,
      { "project-a": "Project A", "project-b": "Project B" }
    );

    expect(decision.recommendedProjectId).toBe("project-a");
    expect(decision.reasons.length).toBeGreaterThanOrEqual(3);
    expect(decision.blockers["project-b"].join(" ")).toContain("TEST-001");
    expect(decision.nextIterationPrompt).toContain("Project A");
    expect(decision.nextIterationPrompt).toContain("失败需求 ID");
    expect(decision.nextIterationPrompt).toContain("步骤 2 · click");
    expect(decision.nextIterationPrompt).toContain("[data-testid=submit]");
    expect(decision.nextIterationPrompt).toContain("artifacts/failure.png");
    expect(decision.nextIterationPrompt).toContain("验收标准");
    expect(decision.nextIterationPrompt).toContain("不得删除、跳过或降低现有测试标准");
  });
});
