import type { ProjectResult, Requirement, RequirementMatrixEntry, RequirementProjectEvidence, RequirementStatus, TestCase, TestCaseResult } from "./types";

export function aggregateRequirementStatus(statuses: Array<TestCaseResult["status"]>): RequirementStatus {
  if (statuses.length === 0 || statuses.every((status) => status === "skipped")) return "untested";
  const verified = statuses.filter((status) => status !== "skipped");
  if (verified.every((status) => status === "passed")) return "passed";
  if (verified.every((status) => status === "failed")) return "failed";
  return "partial";
}

function evidenceFor(testResults: TestCaseResult[]): RequirementProjectEvidence {
  const verified = testResults.filter((result) => result.status !== "skipped");
  return {
    status: aggregateRequirementStatus(testResults.map((result) => result.status)),
    evidence: [...new Set(testResults.flatMap((result) => result.screenshots))],
    passedTests: verified.filter((result) => result.status === "passed").length,
    totalTests: verified.length
  };
}

export function buildRequirementMatrix(
  requirements: Requirement[],
  testCases: TestCase[],
  results: [ProjectResult, ProjectResult]
): RequirementMatrixEntry[] {
  return requirements.map((requirement) => {
    const linked = testCases.filter((testCase) => testCase.requirementId === requirement.id);
    const linkedIds = new Set(linked.map((testCase) => testCase.id));
    const projectA = results[0].testCases.filter((result) => linkedIds.has(result.testCaseId));
    const projectB = results[1].testCases.filter((result) => linkedIds.has(result.testCaseId));
    return {
      requirement,
      testCaseIds: linked.map((testCase) => testCase.id),
      projectA: evidenceFor(projectA),
      projectB: evidenceFor(projectB)
    };
  });
}
