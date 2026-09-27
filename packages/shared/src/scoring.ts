import type { ProjectId, ProjectResult, RequirementMatrixEntry, RequirementStatus, ScoreBreakdown, ScoreExplanation, TestCaseResult } from "./types";

const round = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const statusValue: Record<RequirementStatus, number> = { passed: 1, partial: 0.5, failed: 0, untested: 0 };
const priorityWeight = { must: 3, should: 2, could: 1 } as const;
const assertionActions = new Set(["expectVisible", "expectHidden", "expectText", "expectUrl", "expectCount"]);

function estimatedPerformance(loadMs?: number, startupMs?: number): number {
  const load = loadMs ?? 5_000;
  const startup = startupMs ?? 30_000;
  const loadScore = clamp(100 - Math.max(0, load - 500) / 35);
  const startupScore = clamp(100 - Math.max(0, startup - 1_000) / 250);
  return loadScore * 0.75 + startupScore * 0.25;
}

const explanation = (baseValue: number | null, finalValue: number | null, deductions: ScoreExplanation["deductions"] = [], caps: ScoreExplanation["caps"] = []): ScoreExplanation => ({
  baseValue,
  deductions,
  bonuses: [],
  caps,
  finalValue
});

function groupedTests(results: TestCaseResult[]): Map<string, TestCaseResult[]> {
  const groups = new Map<string, TestCaseResult[]>();
  for (const result of results) groups.set(result.testCaseId, [...(groups.get(result.testCaseId) ?? []), result]);
  return groups;
}

function evidenceMetrics(result: ProjectResult, matrix: RequirementMatrixEntry[]) {
  const expectedIds = new Set(matrix.flatMap((entry) => entry.testCaseIds));
  const groups = groupedTests(result.testCases);
  const denominator = expectedIds.size;
  let executed = 0;
  let asserted = 0;
  let strong = 0;
  for (const id of expectedIds) {
    const executions = groups.get(id) ?? [];
    const didExecute = executions.length > 0 && executions.every((item) => item.status !== "skipped");
    const hasAssertion = didExecute && executions.some((item) => item.steps.some((step) => step.status !== "skipped" && assertionActions.has(step.action)));
    const hasEvidence = executions.some((item) => item.screenshots.length > 0 || item.logs.length > 0 || (item.requestFailures?.length ?? 0) > 0);
    if (didExecute) executed += 1;
    if (hasAssertion) asserted += 1;
    if (hasAssertion && hasEvidence) strong += 1;
  }
  const percent = (count: number) => denominator === 0 ? 0 : count / denominator * 100;
  return { execution: percent(executed), assertion: percent(asserted), strong: percent(strong) };
}

export function calculateProjectScore(result: ProjectResult, matrix: RequirementMatrixEntry[], projectId: ProjectId): ScoreBreakdown {
  const side = projectId === "project-a" ? "projectA" : "projectB";
  const weighted = matrix.map((entry) => ({ status: entry[side].status, weight: priorityWeight[entry.requirement.priority], priority: entry.requirement.priority }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const verified = weighted.filter((item) => item.status !== "untested");
  const verifiedWeight = verified.reduce((sum, item) => sum + item.weight, 0);
  const earnedWeight = verified.reduce((sum, item) => sum + item.weight * statusValue[item.status], 0);
  const verifiedPassRate = verifiedWeight === 0 ? 0 : earnedWeight / verifiedWeight * 100;
  const requirementCoverage = totalWeight === 0 ? 0 : verifiedWeight / totalWeight * 100;
  const effectiveRequirementScore = verifiedPassRate * requirementCoverage / 100;

  const critical = result.testCases.filter((testCase) => testCase.critical);
  const criticalInteractions = critical.length === 0 ? 0 : critical.filter((testCase) => testCase.status === "passed").length / critical.length * 100;

  const errorCount = result.browserLogs.filter((log) => log.type === "error" || log.type === "pageerror").length;
  const stabilityDeductions = [
    ...(errorCount ? [{ label: `浏览器严重错误 × ${errorCount}`, value: -errorCount * 10 }] : []),
    ...(result.requestFailures.length ? [{ label: `网络请求失败 × ${result.requestFailures.length}`, value: -result.requestFailures.length * 4 }] : []),
    ...(result.startup.status !== "passed" ? [{ label: "项目启动失败", value: -65 }] : []),
    ...(!result.baseChecks.accessible || result.baseChecks.blankPage ? [{ label: "首页不可访问或空白", value: -40 }] : [])
  ];
  const stability = clamp(100 + stabilityDeductions.reduce((sum, item) => sum + item.value, 0));

  const lighthousePerformance = result.lighthouse?.status === "completed" ? result.lighthouse.categories?.performance : undefined;
  const performanceEstimated = typeof lighthousePerformance !== "number";
  const performance = performanceEstimated ? Math.min(85, estimatedPerformance(result.metrics.pageLoadDurationMs, result.metrics.startupDurationMs)) : clamp(lighthousePerformance * 100);
  const hasMobileResult = result.responsive.some((item) => item.viewport === "mobile");
  const overflowDeductions = result.responsive.flatMap((item) => item.hasHorizontalOverflow ? [{ label: `${item.viewport} 横向溢出 ${item.overflowAmount}px`, value: -Math.min(50, 20 + item.overflowAmount / 4) }] : []);
  const responsive = hasMobileResult ? clamp(100 + overflowDeductions.reduce((sum, item) => sum + item.value, 0)) : 50;
  const accessibilityDeductions = result.accessibility?.status === "completed" ? [
    ...(result.accessibility.criticalCount ? [{ label: `axe critical × ${result.accessibility.criticalCount}`, value: -result.accessibility.criticalCount * 18 }] : []),
    ...(result.accessibility.seriousCount ? [{ label: `axe serious × ${result.accessibility.seriousCount}`, value: -result.accessibility.seriousCount * 8 }] : []),
    ...((result.accessibility.violationCount - result.accessibility.criticalCount - result.accessibility.seriousCount) > 0 ? [{ label: "axe 其他问题", value: -Math.max(0, result.accessibility.violationCount - result.accessibility.criticalCount - result.accessibility.seriousCount) * 3 }] : [])
  ] : [{ label: "axe 未执行", value: -50 }];
  const accessibility = clamp(100 + accessibilityDeductions.reduce((sum, item) => sum + item.value, 0));
  const checks = result.baseChecks;
  const baseQualityDeductions = [
    ...(!checks.accessible ? [{ label: "页面不可访问", value: -20 }] : []), ...(!checks.httpOk ? [{ label: "HTTP 状态异常", value: -20 }] : []),
    ...(!checks.hasTitle ? [{ label: "页面缺少标题", value: -20 }] : []), ...(!checks.hasVisibleContent || checks.blankPage ? [{ label: "页面正文为空", value: -20 }] : []),
    ...(checks.severeErrorCount > 0 ? [{ label: "存在严重页面错误", value: -20 }] : [])
  ];
  const baseQuality = clamp(100 + baseQualityDeductions.reduce((sum, item) => sum + item.value, 0));

  const rawTotal = effectiveRequirementScore * 0.35 + criticalInteractions * 0.25 + stability * 0.15 + performance * 0.10 + responsive * 0.08 + accessibility * 0.04 + baseQuality * 0.03;
  const capReasons: string[] = [];
  let scoreCap: number | null = null;
  if (weighted.some((item) => item.priority === "must" && item.status === "untested")) {
    scoreCap = 69;
    capReasons.push("存在未测试的 Must 需求，总分最高 69");
  } else if (requirementCoverage < 70) {
    scoreCap = 79;
    capReasons.push("Must 已覆盖但总需求覆盖率低于 70%，总分最高 79");
  }
  const cappedTotal = scoreCap === null ? rawTotal : Math.min(rawTotal, scoreCap);
  const total = result.startup.status === "passed" ? round(cappedTotal) : null;
  const evidence = evidenceMetrics(result, matrix);
  const unexecutedChecks: string[] = [];
  if (result.lighthouse?.status !== "completed") unexecutedChecks.push("Lighthouse");
  if (result.accessibility?.status !== "completed") unexecutedChecks.push("axe");
  if (!hasMobileResult) unexecutedChecks.push("移动端");
  const caps = scoreCap === null ? [] : [{ label: capReasons[0] ?? "评分上限", limit: scoreCap }];

  return {
    total,
    requirementCompletion: round(verifiedPassRate),
    verifiedPassRate: round(verifiedPassRate),
    requirementCoverage: round(requirementCoverage),
    effectiveRequirementScore: round(effectiveRequirementScore),
    criticalInteractions: round(criticalInteractions),
    stability: round(stability),
    performance: round(performance),
    performanceEstimated,
    responsive: round(responsive),
    accessibility: round(accessibility),
    baseQuality: round(baseQuality),
    evidenceCoverage: round(evidence.strong),
    executionCoverage: round(evidence.execution),
    assertionCoverage: round(evidence.assertion),
    strongEvidenceCoverage: round(evidence.strong),
    scoreCap,
    capReasons,
    explanations: {
      requirement: explanation(verifiedPassRate, round(effectiveRequirementScore), [{ label: `需求覆盖率 ${round(requirementCoverage)}%`, value: round(effectiveRequirementScore - verifiedPassRate) }], caps),
      criticalInteractions: explanation(100, round(criticalInteractions), criticalInteractions < 100 ? [{ label: "关键测试未全部通过", value: round(criticalInteractions - 100) }] : []),
      stability: explanation(100, round(stability), stabilityDeductions),
      performance: explanation(performanceEstimated ? 85 : 100, round(performance), performanceEstimated ? [{ label: "Lighthouse 未完成，使用耗时估算", value: round(performance - 85) }] : []),
      responsive: explanation(hasMobileResult ? 100 : 50, round(responsive), overflowDeductions),
      accessibility: explanation(100, round(accessibility), accessibilityDeductions),
      baseQuality: explanation(100, round(baseQuality), baseQualityDeductions),
      evidence: explanation(100, round(evidence.strong), evidence.strong < 100 ? [{ label: "断言与可追踪证据未覆盖全部测试", value: round(evidence.strong - 100) }] : []),
      total: explanation(round(rawTotal), total, [], caps)
    },
    unexecutedChecks
  };
}
