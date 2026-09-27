import { describe, expect, it } from "vitest";
import { buildRequirementMatrix, calculateProjectScore, decisionSummaryFromEvaluation, finalizeEvaluation, releaseAssessmentFromEvaluation, type BenchmarkRun, type ProjectId, type ProjectResult, type ReleaseJudgement } from "@agentbench/shared";
import { generateHtmlReport, generateJsonReport, generateMarkdownReport } from "../reports/report-generator";

const projectResult = (projectId: ProjectId): ProjectResult => ({
  projectId,
  status: "passed",
  startup: { status: "passed", durationMs: 100 },
  baseChecks: { accessible: true, httpOk: true, hasTitle: true, hasVisibleContent: true, blankPage: false, severeErrorCount: 0 },
  testCases: [{ testCaseId: "TEST-1", requirementId: "REQ-1", status: "passed", startedAt: "x", completedAt: "y", durationMs: 10, steps: [{ index: 0, action: "goto", status: "passed", durationMs: 1, viewport: "desktop" }], screenshots: ["artifacts/demo.png"], logs: [], critical: true }],
  browserLogs: [], requestFailures: [],
  responsive: [{ viewport: "mobile", hasHorizontalOverflow: false, documentWidth: 390, viewportWidth: 390, overflowAmount: 0 }],
  accessibility: { status: "completed", violations: [], violationCount: 0, seriousCount: 0, criticalCount: 0 },
  lighthouse: { status: "completed", categories: { performance: 0.9, accessibility: 0.9, bestPractices: 0.9, seo: 0.9 } },
  metrics: { testDurationMs: 10 }, artifacts: []
});

function makeRun(includeAbsolutePaths: boolean): BenchmarkRun {
  const requirements = [{ id: "REQ-1", title: "Demo", priority: "must" as const }];
  const testCases = [{ id: "TEST-1", name: "Demo", requirementId: "REQ-1", critical: true, steps: [{ action: "goto" as const, path: "/" }] }];
  const projects: BenchmarkRun["projects"] = [
    { id: "project-a", name: "A", localPath: "C:\\Users\\private-user\\projects\\alpha", startCommand: "npm run dev", port: 4173, baseUrl: "http://127.0.0.1:4173", startupTimeoutMs: 30_000 },
    { id: "project-b", name: "B", localPath: "/home/private-user/projects/beta", startCommand: "npm run dev", port: 4174, baseUrl: "http://127.0.0.1:4174", startupTimeoutMs: 30_000 }
  ];
  const projectResults: [ProjectResult, ProjectResult] = [projectResult("project-a"), projectResult("project-b")];
  const matrix = buildRequirementMatrix(requirements, testCases, projectResults);
  const scores = { "project-a": calculateProjectScore(projectResults[0], matrix, "project-a"), "project-b": calculateProjectScore(projectResults[1], matrix, "project-b") };
  projectResults[0].browserLogs = [{ type: "error", message: "C:\\Users\\private-user\\projects\\alpha\\src\\App.tsx crashed", timestamp: "x" }];
  projectResults[0].requestFailures = [{ url: "http://127.0.0.1/api", method: "GET", reason: "See X:\\private-output\\secret-project\\network.log", resourceType: "fetch", timestamp: "x" }];
  const evaluation = finalizeEvaluation({ projectResults, scores, requirementMatrix: matrix, requirements, testCases, projectNames: { "project-a": "A", "project-b": "B" } });
  return {
    id: "demo", name: "Privacy", status: "completed", createdAt: "2026-07-18T00:00:00.000Z", completedAt: "2026-07-18T00:01:00.000Z",
    projects, requirements, testCases,
    settings: { runInstall: false, runLighthouse: true, runAxe: true, testMobile: true, includeAbsolutePaths, startupTimeoutMs: 30_000, stepTimeoutMs: 5_000 },
    progress: { stage: "completed", completed: 12, total: 12 },
    results: { projectResults, requirementMatrix: matrix, scores, evaluation, decision: decisionSummaryFromEvaluation(evaluation), assessment: releaseAssessmentFromEvaluation(evaluation), generatedAt: "2026-07-18T00:01:00.000Z" }
  };
}

describe("report privacy", () => {
  it("redacts usernames and absolute paths from every report by default", async () => {
    const run = makeRun(false);
    const reports = [await generateHtmlReport(run), generateMarkdownReport(run), generateJsonReport(run)];
    for (const report of reports) {
      expect(report).not.toContain("private-user");
      expect(report).not.toContain("C:\\Users");
      expect(report).toContain("alpha");
      expect(report).toContain("beta");
    }
  });

  it("includes absolute paths only after explicit opt in", async () => {
    const run = makeRun(true);
    expect(await generateHtmlReport(run)).toContain("private-user");
    expect(generateMarkdownReport(run)).toContain("private-user");
    expect(generateJsonReport(run)).toContain("private-user");
  });

  it.each(["blocked", "conditional", "ready", "not-comparable"] satisfies ReleaseJudgement[])("keeps %s consistent in HTML, Markdown and JSON", async (judgement) => {
    const run = makeRun(false);
    if (!run.results?.evaluation) throw new Error("missing evaluation fixture");
    run.results.evaluation = { ...run.results.evaluation, releaseJudgement: judgement, comparable: judgement !== "not-comparable", recommendedProjectId: judgement === "not-comparable" ? null : "project-a", recommendedProjectName: judgement === "not-comparable" ? "不可比较" : "A", recommendedDevelopmentBase: judgement === "not-comparable" ? null : "project-a", decisionScore: judgement === "not-comparable" ? null : 90 };
    const reports = [await generateHtmlReport(run), generateMarkdownReport(run), generateJsonReport(run)];
    for (const report of reports) expect(report).toContain(judgement);
    if (judgement === "not-comparable") for (const report of reports) expect(report).toContain("不可比较");
  });
});
