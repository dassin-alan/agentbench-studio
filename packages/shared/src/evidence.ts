import type { ArtifactReference, BrowserLog, ProjectResult, RequestFailure, TestCaseResult } from "./types";

export type RequirementEvidenceBundle = {
  testResults: TestCaseResult[];
  logs: BrowserLog[];
  requestFailures: RequestFailure[];
  artifacts: ArtifactReference[];
};

export function evidenceForRequirement(project: ProjectResult, testCaseIds: string[]): RequirementEvidenceBundle {
  const ids = new Set(testCaseIds);
  const testResults = project.testCases.filter((result) => ids.has(result.testCaseId));
  return {
    testResults,
    logs: testResults.flatMap((result) => result.logs),
    requestFailures: testResults.flatMap((result) => result.requestFailures ?? []),
    artifacts: project.artifacts.filter((artifact) => artifact.testCaseId !== "BASE" && Boolean(artifact.testCaseId && ids.has(artifact.testCaseId)))
  };
}

export function globalEvidenceForProject(project: ProjectResult): RequirementEvidenceBundle {
  return {
    testResults: [],
    logs: project.browserLogs.filter((log) => !log.testCaseId || log.testCaseId === "BASE"),
    requestFailures: project.requestFailures.filter((failure) => !failure.testCaseId || failure.testCaseId === "BASE"),
    artifacts: project.artifacts.filter((artifact) => !artifact.testCaseId || artifact.testCaseId === "BASE")
  };
}
