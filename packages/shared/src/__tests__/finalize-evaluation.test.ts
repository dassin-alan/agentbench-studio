import { describe, expect, it } from "vitest";
import { finalizeEvaluation } from "../finalize-evaluation";
import type { ProjectId, ProjectResult, Requirement, RequirementMatrixEntry, ScoreBreakdown, TestCase } from "../types";

const requirements: Requirement[] = [
  { id: "REQ-MUST", title: "核心搜索", priority: "must" },
  { id: "REQ-SHOULD", title: "筛选体验", priority: "should" }
];

const tests: TestCase[] = [
  { id: "TEST-MUST", name: "搜索", requirementId: "REQ-MUST", critical: true, viewports: ["desktop"], steps: [{ action: "expectVisible", selector: "#search" }, { action: "screenshot", name: "search" }] },
  { id: "TEST-SHOULD", name: "筛选", requirementId: "REQ-SHOULD", critical: false, viewports: ["desktop"], steps: [{ action: "expectVisible", selector: "#filter" }, { action: "screenshot", name: "filter" }] }
];

const result = (projectId: ProjectId, overrides: Partial<ProjectResult> = {}): ProjectResult => ({
  projectId,
  status: "passed",
  startup: { status: "passed", durationMs: 100 },
  baseChecks: { accessible: true, httpOk: true, hasTitle: true, hasVisibleContent: true, blankPage: false, severeErrorCount: 0 },
  testCases: tests.map((testCase) => ({
    testCaseId: testCase.id,
    requirementId: testCase.requirementId,
    status: "passed" as const,
    startedAt: "x",
    completedAt: "y",
    durationMs: 10,
    steps: [{ index: 0, action: "expectVisible" as const, status: "passed" as const, durationMs: 2, viewport: "desktop", selector: testCase.id === "TEST-MUST" ? "#search" : "#filter" }],
    screenshots: [`artifacts/${projectId}/${testCase.id}.png`],
    logs: [],
    requestFailures: [],
    critical: testCase.critical,
    viewport: "desktop"
  })),
  browserLogs: [],
  requestFailures: [],
  responsive: [{ viewport: "mobile", hasHorizontalOverflow: false, documentWidth: 390, viewportWidth: 390, overflowAmount: 0 }],
  accessibility: { status: "completed", violations: [], violationCount: 0, seriousCount: 0, criticalCount: 0 },
  lighthouse: { status: "completed", categories: { performance: 0.9, accessibility: 0.9, bestPractices: 0.9, seo: 0.9 } },
  metrics: { testDurationMs: 20 },
  artifacts: [],
  ...overrides
});

const matrix = (mustA: RequirementMatrixEntry["projectA"]["status"] = "passed", mustB: RequirementMatrixEntry["projectB"]["status"] = "passed"): RequirementMatrixEntry[] => [
  { requirement: requirements[0]!, testCaseIds: ["TEST-MUST"], projectA: { status: mustA, evidence: mustA === "untested" ? [] : ["a.png"] }, projectB: { status: mustB, evidence: mustB === "untested" ? [] : ["b.png"] } },
  { requirement: requirements[1]!, testCaseIds: ["TEST-SHOULD"], projectA: { status: "passed", evidence: ["a2.png"] }, projectB: { status: "passed", evidence: ["b2.png"] } }
];

const score = (total: number | null): ScoreBreakdown => ({
  total,
  requirementCompletion: total ?? 0,
  verifiedPassRate: total ?? 0,
  requirementCoverage: 100,
  effectiveRequirementScore: total ?? 0,
  criticalInteractions: total ?? 0,
  stability: total ?? 0,
  performance: total ?? 0,
  performanceEstimated: false,
  responsive: total ?? 0,
  accessibility: total ?? 0,
  baseQuality: total ?? 0,
  evidenceCoverage: 100,
  executionCoverage: 100,
  assertionCoverage: 100,
  strongEvidenceCoverage: 100,
  scoreCap: null,
  capReasons: [],
  explanations: {},
  unexecutedChecks: []
});

const evaluate = (projectResults: [ProjectResult, ProjectResult], requirementMatrix = matrix(), scores = { "project-a": score(92), "project-b": score(85) }) => finalizeEvaluation({
  projectResults,
  scores,
  requirementMatrix,
  requirements,
  testCases: tests,
  projectNames: { "project-a": "Project A", "project-b": "Project B" }
});

describe("unified final evaluation", () => {
  it("never reports ready when a P0 blocker exists", () => {
    const failedMust = result("project-a", { testCases: result("project-a").testCases.map((item) => item.testCaseId === "TEST-MUST" ? { ...item, status: "failed", error: "selector missing" } : item) });
    const evaluation = evaluate([failedMust, result("project-b")], matrix("failed", "passed"));
    expect(evaluation.blockers.some((item) => item.severity === "p0" && item.projectId === "project-a")).toBe(true);
    expect(evaluation.releaseJudgement).not.toBe("ready");
  });

  it("returns no recommendation when both projects fail to start", () => {
    const failed = (id: ProjectId) => result(id, { status: "failed", startup: { status: "failed", durationMs: 5, error: "port unavailable" }, testCases: [] });
    const evaluation = evaluate([failed("project-a"), failed("project-b")], matrix("untested", "untested"), { "project-a": score(null), "project-b": score(null) });
    expect(evaluation.comparable).toBe(false);
    expect(evaluation.recommendedProjectId).toBeNull();
    expect(evaluation.recommendedProjectName).toBe("不可比较");
    expect(evaluation.releaseJudgement).toBe("not-comparable");
    expect(evaluation.nextIterationPrompt).toContain("恢复可比较条件");
  });

  it("does not release a high scoring project with untested Must requirements", () => {
    const evaluation = evaluate([result("project-a"), result("project-b")], matrix("untested", "passed"), { "project-a": score(99), "project-b": score(80) });
    expect(evaluation.releaseRecommendedProject).not.toBe("project-a");
    expect(evaluation.releaseRecommendedProject).toBe("project-b");
  });

  it("can prefer a slightly lower score with no blocker and explains why", () => {
    const partialA = result("project-a", { testCases: result("project-a").testCases.map((item) => item.testCaseId === "TEST-MUST" ? { ...item, status: "failed" } : item) });
    const evaluation = evaluate([partialA, result("project-b")], matrix("partial", "passed"), { "project-a": score(88), "project-b": score(84) });
    expect(evaluation.recommendedDevelopmentBase).toBe("project-b");
    expect(evaluation.recommendationReasons.join(" ")).toMatch(/Must|阻断/);
  });

  it("produces conditional when optional quality checks are skipped", () => {
    const skipped = result("project-a", { lighthouse: { status: "skipped", reason: "Chrome unavailable" } });
    const evaluation = evaluate([skipped, result("project-b")]);
    expect(evaluation.releaseJudgement).toBe("conditional");
    expect(evaluation.confidence).toBe("medium");
  });
});
