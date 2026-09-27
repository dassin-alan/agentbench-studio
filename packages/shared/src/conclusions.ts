import { decisionSummaryFromEvaluation, finalizeEvaluation } from "./finalize-evaluation";
import type { DecisionSummary, ProjectId, ProjectResult, RequirementMatrixEntry, ScoreBreakdown, TestCase } from "./types";

/** @deprecated New code must call finalizeEvaluation once and persist its complete result. */
export function generateDecision(
  results: [ProjectResult, ProjectResult],
  scores: Record<ProjectId, ScoreBreakdown>,
  matrix: RequirementMatrixEntry[],
  names: Record<ProjectId, string>
): DecisionSummary {
  const tests = new Map<string, TestCase>();
  for (const result of results.flatMap((project) => project.testCases)) {
    if (!tests.has(result.testCaseId)) tests.set(result.testCaseId, {
      id: result.testCaseId,
      name: result.testCaseId,
      requirementId: result.requirementId,
      critical: Boolean(result.critical),
      viewports: result.viewport ? [result.viewport] : ["desktop"],
      steps: [{ action: "expectVisible", selector: "body" }]
    });
  }
  const evaluation = finalizeEvaluation({
    projectResults: results,
    scores,
    requirementMatrix: matrix,
    requirements: matrix.map((entry) => entry.requirement),
    testCases: [...tests.values()],
    projectNames: names
  });
  return decisionSummaryFromEvaluation(evaluation);
}
