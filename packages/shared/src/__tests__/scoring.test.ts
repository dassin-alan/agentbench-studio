import { describe, expect, it } from "vitest";
import { calculateProjectScore } from "../scoring";
import type { ProjectResult, RequirementMatrixEntry } from "../types";

const result: ProjectResult = {
  projectId: "project-a",
  status: "passed",
  startup: { status: "passed", durationMs: 700 },
  baseChecks: { accessible: true, httpOk: true, hasTitle: true, hasVisibleContent: true, blankPage: false, severeErrorCount: 0 },
  testCases: [
    { testCaseId: "T1", requirementId: "R1", status: "passed", startedAt: "x", completedAt: "y", durationMs: 10, steps: [], screenshots: ["x.png"], logs: [], critical: true },
    { testCaseId: "T2", requirementId: "R2", status: "failed", startedAt: "x", completedAt: "y", durationMs: 10, steps: [], screenshots: [], logs: [], critical: false }
  ],
  browserLogs: [],
  requestFailures: [],
  responsive: [{ viewport: "desktop", hasHorizontalOverflow: false, documentWidth: 1440, viewportWidth: 1440, overflowAmount: 0 }],
  accessibility: { status: "completed", violations: [], violationCount: 0, seriousCount: 0, criticalCount: 0 },
  lighthouse: { status: "completed", categories: { performance: 0.9, accessibility: 0.95, bestPractices: 0.92, seo: 0.9 }, metrics: {} },
  metrics: { startupDurationMs: 700, pageLoadDurationMs: 450, testDurationMs: 1200 },
  artifacts: []
};

const matrix: RequirementMatrixEntry[] = [
  { requirement: { id: "R1", title: "one", priority: "must" }, testCaseIds: ["T1"], projectA: { status: "passed", evidence: [] }, projectB: { status: "failed", evidence: [] } },
  { requirement: { id: "R2", title: "two", priority: "should" }, testCaseIds: ["T2"], projectA: { status: "failed", evidence: [] }, projectB: { status: "failed", evidence: [] } },
  { requirement: { id: "R3", title: "three", priority: "could" }, testCaseIds: [], projectA: { status: "untested", evidence: [] }, projectB: { status: "untested", evidence: [] } }
];

describe("fixed scoring", () => {
  it("is deterministic and excludes untested requirements from completion", () => {
    const first = calculateProjectScore(result, matrix, "project-a");
    const second = calculateProjectScore(result, matrix, "project-a");

    expect(first).toEqual(second);
    expect(first.requirementCompletion).toBe(60);
    expect(first.requirementCoverage).toBeCloseTo(83.3, 1);
    expect(first.criticalInteractions).toBe(100);
    expect(first.total).toBeGreaterThan(70);
  });

  it("marks performance as estimated when Lighthouse is skipped", () => {
    const estimated = calculateProjectScore({ ...result, lighthouse: { status: "skipped", reason: "Chrome unavailable" } }, matrix, "project-a");

    expect(estimated.performanceEstimated).toBe(true);
    expect(estimated.performance).toBeGreaterThan(0);
    expect(estimated.performance).toBeLessThanOrEqual(85);
    expect(estimated.unexecutedChecks).toContain("Lighthouse");
  });

  it("does not award a normal total when startup failed", () => {
    const failed = calculateProjectScore({ ...result, status: "failed", startup: { status: "failed", durationMs: 10, error: "port occupied" } }, matrix, "project-a");
    expect(failed.total).toBeNull();
  });

  it("does not treat skipped axe and mobile checks as full scores", () => {
    const skipped = calculateProjectScore({
      ...result,
      responsive: [],
      accessibility: { status: "skipped", violations: [], violationCount: 0, seriousCount: 0, criticalCount: 0, reason: "disabled" }
    }, matrix, "project-a");
    expect(skipped.accessibility).toBeLessThan(100);
    expect(skipped.responsive).toBeLessThan(100);
    expect(skipped.unexecutedChecks).toEqual(expect.arrayContaining(["axe", "移动端"]));
  });

  it("prevents one tested requirement out of ten from earning a high effective requirement score", () => {
    const sparseMatrix: RequirementMatrixEntry[] = Array.from({ length: 10 }, (_, index) => ({
      requirement: { id: `R${index + 1}`, title: `Requirement ${index + 1}`, priority: index < 2 ? "must" : "should" },
      testCaseIds: index === 0 ? ["T1"] : [],
      projectA: { status: index === 0 ? "passed" : "untested", evidence: index === 0 ? ["proof.png"] : [] },
      projectB: { status: "untested", evidence: [] }
    }));
    const sparse = calculateProjectScore(result, sparseMatrix, "project-a");
    expect(sparse.verifiedPassRate).toBe(100);
    expect(sparse.requirementCoverage).toBeLessThan(20);
    expect(sparse.effectiveRequirementScore).toBeLessThan(20);
    expect(sparse.total).toBeLessThanOrEqual(69);
    expect(sparse.capReasons.join(" ")).toContain("Must");
  });

  it("provides deterministic explanations for every score dimension", () => {
    const scored = calculateProjectScore(result, matrix, "project-a");
    expect(scored.explanations.stability?.baseValue).toBe(100);
    expect(scored.explanations.stability?.finalValue).toBe(scored.stability);
    expect(scored.explanations.total?.finalValue).toBe(scored.total);
  });
});
