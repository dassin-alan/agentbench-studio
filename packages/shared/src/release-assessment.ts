import { calculateProjectScore } from "./scoring";
import { finalizeEvaluation, releaseAssessmentFromEvaluation } from "./finalize-evaluation";
import type { ProjectId, ProjectResult, ReleaseAssessment, RequirementMatrixEntry, TestCase } from "./types";

/** @deprecated New code must call finalizeEvaluation once and persist its complete result. */
export function assessRelease(results: [ProjectResult, ProjectResult], matrix: RequirementMatrixEntry[], testCases: TestCase[]): ReleaseAssessment {
  const scores = {
    "project-a": calculateProjectScore(results[0], matrix, "project-a"),
    "project-b": calculateProjectScore(results[1], matrix, "project-b")
  } satisfies Record<ProjectId, ReturnType<typeof calculateProjectScore>>;
  const evaluation = finalizeEvaluation({
    projectResults: results,
    scores,
    requirementMatrix: matrix,
    requirements: matrix.map((entry) => entry.requirement),
    testCases,
    projectNames: { "project-a": "Project A", "project-b": "Project B" }
  });
  return releaseAssessmentFromEvaluation(evaluation);
}
