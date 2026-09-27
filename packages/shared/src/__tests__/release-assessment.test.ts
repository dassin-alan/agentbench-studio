import { describe, expect, it } from "vitest";
import { assessRelease } from "../release-assessment";
import type { ProjectResult, RequirementMatrixEntry, TestCase } from "../types";

const testCases: TestCase[] = [
  { id: "TEST-MUST", name: "must", requirementId: "REQ-MUST", critical: true, steps: [{ action: "goto", path: "/" }] },
  { id: "TEST-SHOULD", name: "should", requirementId: "REQ-SHOULD", critical: false, steps: [{ action: "goto", path: "/" }] }
];

const result = (projectId: "project-a" | "project-b", overrides: Partial<ProjectResult> = {}): ProjectResult => ({
  projectId,
  status: "passed",
  startup: { status: "passed", durationMs: 100 },
  baseChecks: { accessible: true, httpOk: true, hasTitle: true, hasVisibleContent: true, blankPage: false, severeErrorCount: 0 },
  testCases: testCases.map((testCase) => ({
    testCaseId: testCase.id,
    requirementId: testCase.requirementId,
    status: "passed" as const,
    startedAt: "x",
    completedAt: "y",
    durationMs: 10,
    steps: [{ index: 0, action: "expectVisible" as const, status: "passed" as const, durationMs: 1, viewport: "desktop", selector: "body" }],
    screenshots: [`artifacts/${projectId}/${testCase.id}.png`],
    logs: [],
    critical: testCase.critical
  })),
  browserLogs: [],
  requestFailures: [],
  responsive: [{ viewport: "mobile", hasHorizontalOverflow: false, documentWidth: 390, viewportWidth: 390, overflowAmount: 0 }],
  accessibility: { status: "completed", violations: [], violationCount: 0, seriousCount: 0, criticalCount: 0 },
  lighthouse: { status: "completed", categories: { performance: 0.9, accessibility: 0.9, bestPractices: 0.9, seo: 0.9 } },
  metrics: { testDurationMs: 100 },
  artifacts: [],
  ...overrides
});

const matrix: RequirementMatrixEntry[] = [
  { requirement: { id: "REQ-MUST", title: "Must", priority: "must" }, testCaseIds: ["TEST-MUST"], projectA: { status: "passed", evidence: ["a.png"] }, projectB: { status: "passed", evidence: ["b.png"] } },
  { requirement: { id: "REQ-SHOULD", title: "Should", priority: "should" }, testCaseIds: ["TEST-SHOULD"], projectA: { status: "passed", evidence: ["a2.png"] }, projectB: { status: "passed", evidence: ["b2.png"] } }
];

describe("deterministic release assessment", () => {
  it("returns high confidence when all required evidence and checks completed", () => {
    const assessment = assessRelease([result("project-a"), result("project-b")], matrix, testCases);
    expect(assessment.comparable).toBe(true);
    expect(assessment.confidence).toBe("high");
    expect(assessment.evidenceCoverage).toBe(100);
  });

  it("drops to medium when a quality signal is skipped", () => {
    const projectA = result("project-a", { lighthouse: { status: "skipped", reason: "Chrome unavailable" } });
    const assessment = assessRelease([projectA, result("project-b")], matrix, testCases);
    expect(assessment.confidence).toBe("medium");
    expect(assessment.confidenceReasons.join(" ")).toContain("Lighthouse");
  });

  it("marks two startup failures as not comparable with low confidence", () => {
    const failed = (id: "project-a" | "project-b") => result(id, { startup: { status: "failed", durationMs: 10, error: "boom" }, status: "failed", testCases: [] });
    const assessment = assessRelease([failed("project-a"), failed("project-b")], matrix, testCases);
    expect(assessment.comparable).toBe(false);
    expect(assessment.confidence).toBe("low");
    expect(assessment.notComparableReasons.join(" ")).toContain("均启动失败");
    expect(assessment.releaseJudgement).toBe("not-comparable");
  });
});
