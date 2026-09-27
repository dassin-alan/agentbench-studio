import type {
  BlockerSeverity, EvaluationBlocker, EvaluationConfidence, FinalEvaluation, ProjectId, ProjectResult,
  ReleaseAssessment, ReleaseJudgement, Requirement, RequirementMatrixEntry, ScoreBreakdown, TestCase, TestCaseResult, DecisionSummary
} from "./types";

export type FinalizeEvaluationInput = {
  projectResults: [ProjectResult, ProjectResult];
  scores: Record<ProjectId, ScoreBreakdown>;
  requirementMatrix: RequirementMatrixEntry[];
  requirements: Requirement[];
  testCases: TestCase[];
  projectNames: Record<ProjectId, string>;
  cancelled?: boolean;
};

const projectSide = (projectId: ProjectId) => projectId === "project-a" ? "projectA" as const : "projectB" as const;
const severityRank: Record<BlockerSeverity, number> = { p0: 0, p1: 1, warning: 2 };
const assertionActions = new Set(["expectVisible", "expectHidden", "expectText", "expectUrl", "expectCount"]);

function blocker(input: Omit<EvaluationBlocker, "id">): EvaluationBlocker {
  return { ...input, id: [input.severity, input.projectId ?? "global", input.source, input.requirementId, input.testCaseId, input.message].filter(Boolean).join(":") };
}

function projectBlockers(project: ProjectResult, matrix: RequirementMatrixEntry[]): EvaluationBlocker[] {
  const projectId = project.projectId as ProjectId;
  const side = projectSide(projectId);
  const items: EvaluationBlocker[] = [];
  if (project.startup.status !== "passed") items.push(blocker({ severity: "p0", source: "startup", projectId, message: `项目启动失败：${project.startup.error ?? "未知错误"}` }));
  if (!project.baseChecks.accessible || !project.baseChecks.httpOk) items.push(blocker({ severity: "p0", source: "base-check", projectId, message: "首页无法正常访问" }));
  if (project.baseChecks.blankPage || !project.baseChecks.hasVisibleContent) items.push(blocker({ severity: "p0", source: "base-check", projectId, message: "首页为空白页或没有可见正文" }));

  for (const entry of matrix) {
    const status = entry[side].status;
    const evidencePaths = entry[side].evidence;
    if (entry.requirement.priority === "must" && status === "failed") items.push(blocker({ severity: "p0", source: "requirement", projectId, requirementId: entry.requirement.id, evidencePaths, message: `Must 需求 ${entry.requirement.id} 失败：${entry.requirement.title}` }));
    else if (entry.requirement.priority === "must" && status === "partial") items.push(blocker({ severity: "p1", source: "requirement", projectId, requirementId: entry.requirement.id, evidencePaths, message: `Must 需求 ${entry.requirement.id} 仅部分通过：${entry.requirement.title}` }));
    else if (entry.requirement.priority === "must" && status === "untested") items.push(blocker({ severity: "warning", source: "coverage", projectId, requirementId: entry.requirement.id, message: `Must 需求 ${entry.requirement.id} 未测试` }));
    else if (status === "failed") items.push(blocker({ severity: "warning", source: "requirement", projectId, requirementId: entry.requirement.id, evidencePaths, message: `${entry.requirement.priority.toUpperCase()} 需求 ${entry.requirement.id} 失败：${entry.requirement.title}` }));
  }

  for (const test of project.testCases) {
    if (test.critical && test.status === "failed") items.push(blocker({ severity: "p0", source: "test", projectId, testCaseId: test.testCaseId, evidencePaths: test.screenshots, message: `关键测试 ${test.testCaseId} 失败：${test.error ?? "未提供错误摘要"}` }));
  }
  const pageErrors = project.browserLogs.filter((log) => log.type === "pageerror");
  if (pageErrors.length > 0 && !items.some((item) => item.source === "test" && item.severity === "p0")) items.push(blocker({ severity: "p1", source: "browser", projectId, message: `检测到 ${pageErrors.length} 个页面运行错误` }));
  if (project.browserLogs.some((log) => log.type === "warning")) items.push(blocker({ severity: "warning", source: "browser", projectId, message: "检测到非阻断控制台警告" }));
  if (project.requestFailures.length >= 2) items.push(blocker({ severity: "p1", source: "network", projectId, message: `检测到 ${project.requestFailures.length} 个网络请求失败` }));
  else if (project.requestFailures.length === 1) items.push(blocker({ severity: "warning", source: "network", projectId, message: "检测到 1 个网络请求失败" }));

  const overflows = project.responsive.filter((item) => item.hasHorizontalOverflow);
  if (overflows.some((item) => item.overflowAmount >= Math.max(32, item.viewportWidth * 0.1))) items.push(blocker({ severity: "p1", source: "responsive", projectId, message: "移动端或响应式视口存在严重横向溢出" }));
  else if (overflows.length > 0) items.push(blocker({ severity: "warning", source: "responsive", projectId, message: "响应式视口存在轻微横向溢出" }));
  if (project.accessibility?.status === "completed" && project.accessibility.criticalCount > 0) items.push(blocker({ severity: "p1", source: "accessibility", projectId, message: `axe 检测发现 ${project.accessibility.criticalCount} 个 critical 问题` }));
  if (project.accessibility?.status === "failed") items.push(blocker({ severity: "p1", source: "accessibility", projectId, message: `axe 检测异常终止：${project.accessibility.reason ?? "未知原因"}` }));
  else if (project.accessibility?.status !== "completed") items.push(blocker({ severity: "warning", source: "accessibility", projectId, message: `axe 未执行：${project.accessibility?.reason ?? "无结果"}` }));
  if (project.lighthouse?.status === "failed") items.push(blocker({ severity: "p1", source: "lighthouse", projectId, message: `Lighthouse 异常终止：${project.lighthouse.reason ?? "未知原因"}` }));
  else if (project.lighthouse?.status !== "completed") items.push(blocker({ severity: "warning", source: "lighthouse", projectId, message: `Lighthouse 未执行：${project.lighthouse?.reason ?? "无结果"}` }));
  if (!project.responsive.some((item) => item.viewport === "mobile")) items.push(blocker({ severity: "warning", source: "responsive", projectId, message: "移动端检测未执行" }));
  return [...new Map(items.map((item) => [item.id, item])).values()].sort((left, right) => severityRank[left.severity] - severityRank[right.severity]);
}

function coverage(projectResults: [ProjectResult, ProjectResult], testCases: TestCase[]) {
  const slots = projectResults.flatMap((project) => testCases.flatMap((test) => (test.viewports?.length ? test.viewports : ["desktop"]).map((viewport) => ({ project, test, viewport }))));
  const percent = (predicate: (results: TestCaseResult[]) => boolean) => {
    if (slots.length === 0) return 0;
    const matched = slots.filter(({ project, test, viewport }) => predicate(project.testCases.filter((result) => result.testCaseId === test.id && (result.viewport ?? result.steps[0]?.viewport ?? "desktop") === viewport))).length;
    return Math.round(matched / slots.length * 1_000) / 10;
  };
  const execution = percent((results) => results.length > 0 && results.some((result) => result.status !== "skipped"));
  const assertion = percent((results) => results.some((result) => result.steps.some((step) => step.status !== "skipped" && assertionActions.has(step.action))));
  const strong = percent((results) => results.some((result) => result.steps.some((step) => step.status !== "skipped" && assertionActions.has(step.action)) && (result.screenshots.length > 0 || result.logs.length > 0 || (result.requestFailures?.length ?? 0) > 0)));
  return { execution, assertion, strong };
}

function compareProject(left: ProjectId, right: ProjectId, input: FinalizeEvaluationInput, blockers: EvaluationBlocker[]): number {
  const count = (id: ProjectId, severity: BlockerSeverity) => blockers.filter((item) => item.projectId === id && item.severity === severity).length;
  for (const severity of ["p0", "p1"] as const) {
    const difference = count(left, severity) - count(right, severity);
    if (difference !== 0) return difference;
  }
  const mustValue = (id: ProjectId) => input.requirementMatrix.filter((entry) => entry.requirement.priority === "must").reduce((sum, entry) => sum + ({ passed: 2, partial: 1, failed: 0, untested: 0 }[entry[projectSide(id)].status]), 0);
  const mustDifference = mustValue(right) - mustValue(left);
  if (mustDifference !== 0) return mustDifference;
  const criticalPassed = (id: ProjectId) => input.projectResults.find((project) => project.projectId === id)?.testCases.filter((test) => test.critical && test.status === "passed").length ?? 0;
  const criticalDifference = criticalPassed(right) - criticalPassed(left);
  if (criticalDifference !== 0) return criticalDifference;
  return (input.scores[right].total ?? -1) - (input.scores[left].total ?? -1);
}

function allMustPassed(id: ProjectId, matrix: RequirementMatrixEntry[]): boolean {
  const must = matrix.filter((entry) => entry.requirement.priority === "must");
  return must.length > 0 && must.every((entry) => entry[projectSide(id)].status === "passed");
}

function buildPrompt(input: FinalizeEvaluationInput, evaluation: Omit<FinalEvaluation, "nextIterationPrompt">): string {
  if (!evaluation.comparable) return [
    "当前评测不可比较。请先恢复可比较条件。", "", "必须修复：", ...evaluation.notComparableReasons.map((reason, index) => `${index + 1}. ${reason}`), "",
    "验收标准：", "1. 两个项目至少能够完成统一关键测试配置。", "2. 重新运行评测后 comparable 必须为 true。", "", "不得删除、跳过或降低现有测试标准。"
  ].join("\n");
  const base = evaluation.recommendedDevelopmentBase;
  const baseName = base ? input.projectNames[base] : "不可比较";
  const project = input.projectResults.find((item) => item.projectId === base);
  const side = base ? projectSide(base) : "projectA";
  const failedRequirements = input.requirementMatrix.filter((entry) => base && ["failed", "partial", "untested"].includes(entry[side].status));
  const failedTests = project?.testCases.filter((test) => test.status === "failed") ?? [];
  const failedSteps = failedTests.flatMap((test) => test.steps.filter((step) => step.status === "failed").map((step) => ({ test, step })));
  const browserErrors = project?.browserLogs.filter((log) => log.type === "error" || log.type === "pageerror" || log.type === "requestfailed") ?? [];
  const network = project?.requestFailures ?? [];
  const evidence = [...new Set(failedTests.flatMap((test) => test.screenshots))];
  const regression = [...new Set([...failedTests.map((test) => test.testCaseId), ...failedRequirements.flatMap((entry) => entry.testCaseIds)])];
  const lines = [
    `请以 ${baseName} 为主版本进行下一轮修改。`, "", `推荐主版本：${baseName}`,
    `失败需求 ID：${failedRequirements.map((entry) => entry.requirement.id).join("、") || "无"}`,
    `失败测试 ID：${failedTests.map((test) => test.testCaseId).join("、") || "无"}`, "", "失败步骤："
  ];
  lines.push(...(failedSteps.length ? failedSteps.map(({ test, step }) => `- ${test.testCaseId} · 步骤 ${step.index + 1} · ${step.action}${step.selector ? ` · selector: ${step.selector}` : ""} · ${step.error ?? test.error ?? "失败"}`) : ["- 无"]));
  lines.push("", "浏览器错误与网络失败：", ...(browserErrors.length || network.length ? [...browserErrors.map((log) => `- ${log.type}: ${log.message}`), ...network.map((failure) => `- ${failure.method} ${failure.url}: ${failure.reason}`)] : ["- 无"]));
  lines.push("", "对应证据截图相对路径：", ...(evidence.length ? evidence.map((path) => `- ${path}`) : ["- 无"]));
  lines.push("", "修复目标：", ...((evaluation.blockers.filter((item) => item.projectId === base).length ? evaluation.blockers.filter((item) => item.projectId === base).map((item, index) => `${index + 1}. [${item.severity.toUpperCase()}] ${item.message}`) : ["1. 保持当前通过项并补齐证据覆盖。"])));
  lines.push("", "验收标准：", "1. 所有 Must 需求均具备可执行测试证据。", "2. 所有关键测试通过且没有 P0/P1 阻断项。", "3. 评分解释、证据和发布判断保持一致。", "", "必须回归的测试：", ...(regression.length ? regression.map((id) => `- ${id}`) : input.testCases.filter((test) => test.critical).map((test) => `- ${test.id}`)), "", "不得删除、跳过或降低现有测试标准。");
  return lines.join("\n");
}

export function finalizeEvaluation(input: FinalizeEvaluationInput): FinalEvaluation {
  const blockers = input.projectResults.flatMap((project) => projectBlockers(project, input.requirementMatrix));
  const notComparableReasons: string[] = [];
  if (input.cancelled) notComparableReasons.push("评测已被中止");
  if (input.projectResults.every((project) => project.startup.status !== "passed")) notComparableReasons.push("两个项目均启动失败");
  const criticalIds = new Set(input.testCases.filter((test) => test.critical).map((test) => test.id));
  const missingCritical = input.projectResults.filter((project) => project.startup.status === "passed").flatMap((project) => [...criticalIds].filter((id) => !project.testCases.some((test) => test.testCaseId === id && test.status !== "skipped")).map((id) => `${project.projectId}:${id}`));
  if (criticalIds.size === 0 || missingCritical.length > 0) notComparableReasons.push("关键测试覆盖不足");
  if (input.projectResults.every((project) => project.startup.status === "passed")) {
    const signatures = input.projectResults.map((project) => project.testCases.map((test) => `${test.testCaseId}:${test.viewport ?? test.steps[0]?.viewport ?? "desktop"}`).sort().join("|"));
    if (signatures[0] !== signatures[1]) notComparableReasons.push("两个项目测试配置不一致");
  }
  const comparable = notComparableReasons.length === 0;
  const metrics = coverage(input.projectResults, input.testCases);
  const shouldUncovered = input.requirementMatrix.some((entry) => entry.requirement.priority === "should" && (entry.projectA.status === "untested" || entry.projectB.status === "untested"));
  const optionalSkipped = input.projectResults.some((project) => project.lighthouse?.status !== "completed" || project.accessibility?.status !== "completed" || !project.responsive.some((item) => item.viewport === "mobile"));
  const multipleUntested = input.requirementMatrix.filter((entry) => entry.projectA.status === "untested" || entry.projectB.status === "untested").length > 1;
  const p1 = blockers.some((item) => item.severity === "p1");
  let confidence: EvaluationConfidence = "high";
  const confidenceReasons: string[] = [];
  if (!comparable || input.projectResults.some((project) => project.startup.status !== "passed") || multipleUntested || metrics.strong < 50) {
    confidence = "low";
    confidenceReasons.push(...notComparableReasons, "存在启动失败、多个未测试需求或关键证据缺失");
  } else if (optionalSkipped || shouldUncovered || p1 || metrics.strong < 100) {
    confidence = "medium";
    if (optionalSkipped) confidenceReasons.push("Lighthouse、axe 或移动端检测存在未执行项");
    if (shouldUncovered) confidenceReasons.push("存在未覆盖的 Should 需求");
    if (p1) confidenceReasons.push("存在 P1 阻断项");
    if (metrics.strong < 100) confidenceReasons.push(`强证据覆盖率为 ${metrics.strong.toFixed(1)}%`);
  } else confidenceReasons.push("关键需求、断言和质量检测证据完整");

  const hasP0 = blockers.some((item) => item.severity === "p0");
  const hasP1 = blockers.some((item) => item.severity === "p1");
  const eligible = (["project-a", "project-b"] as const).filter((id) => allMustPassed(id, input.requirementMatrix));
  let releaseJudgement: ReleaseJudgement;
  const releaseReasons: string[] = [];
  if (!comparable) { releaseJudgement = "not-comparable"; releaseReasons.push(...notComparableReasons); }
  else if (hasP0) { releaseJudgement = "blocked"; releaseReasons.push("存在 P0 发布阻断项"); }
  else if (hasP1 || optionalSkipped || shouldUncovered || confidence !== "high" || eligible.length === 0) { releaseJudgement = "conditional"; releaseReasons.push("仍有 P1、未执行检测、需求覆盖或置信度条件未满足"); }
  else { releaseJudgement = "ready"; releaseReasons.push("可比较、Must 全部通过、无 P0/P1 且关键证据完整"); }

  const ranked = (["project-a", "project-b"] as ProjectId[]).sort((left, right) => compareProject(left, right, input, blockers));
  const recommendedDevelopmentBase = comparable ? ranked[0] ?? null : null;
  const recommendationReasons = comparable && recommendedDevelopmentBase ? [
    `${input.projectNames[recommendedDevelopmentBase]} 的高优先级阻断项更少或相同`,
    `${input.projectNames[recommendedDevelopmentBase]} 的 Must 需求与关键测试结果更适合作为继续修复基线`,
    `固定综合评分为 ${input.scores[recommendedDevelopmentBase].total?.toFixed(1) ?? "不可评分"}，并已结合覆盖率上限与证据质量`
  ] : [...notComparableReasons];
  const releaseRecommendedProject = releaseJudgement === "ready" && recommendedDevelopmentBase && eligible.includes(recommendedDevelopmentBase) ? recommendedDevelopmentBase : null;
  const partial: Omit<FinalEvaluation, "nextIterationPrompt"> = {
    blockers, comparable, notComparableReasons, confidence, confidenceReasons, releaseJudgement, releaseReasons,
    recommendedProjectId: recommendedDevelopmentBase,
    recommendedProjectName: recommendedDevelopmentBase ? input.projectNames[recommendedDevelopmentBase] : "不可比较",
    recommendedDevelopmentBase,
    releaseRecommendedProject,
    recommendationReasons,
    decisionScore: recommendedDevelopmentBase ? input.scores[recommendedDevelopmentBase].total : null,
    executionCoverage: metrics.execution,
    assertionCoverage: metrics.assertion,
    strongEvidenceCoverage: metrics.strong
  };
  return { ...partial, nextIterationPrompt: buildPrompt(input, partial) };
}

export function decisionSummaryFromEvaluation(evaluation: FinalEvaluation): DecisionSummary {
  return {
    recommendedProjectId: evaluation.recommendedProjectId,
    recommendedProjectName: evaluation.recommendedProjectName,
    reasons: evaluation.recommendationReasons,
    blockers: {
      "project-a": evaluation.blockers.filter((item) => item.projectId === "project-a").map((item) => `[${item.severity.toUpperCase()}] ${item.message}`),
      "project-b": evaluation.blockers.filter((item) => item.projectId === "project-b").map((item) => `[${item.severity.toUpperCase()}] ${item.message}`)
    },
    transferableAdvantages: [],
    nextIterationPrompt: evaluation.nextIterationPrompt
  };
}

export function releaseAssessmentFromEvaluation(evaluation: FinalEvaluation): ReleaseAssessment {
  return {
    comparable: evaluation.comparable,
    notComparableReasons: evaluation.notComparableReasons,
    confidence: evaluation.confidence,
    confidenceReasons: evaluation.confidenceReasons,
    evidenceCoverage: evaluation.strongEvidenceCoverage,
    releaseJudgement: evaluation.releaseJudgement,
    releaseReasons: evaluation.releaseReasons
  };
}
