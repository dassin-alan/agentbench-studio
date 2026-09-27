import { readFile } from "node:fs/promises";
import path from "node:path";
import { finalizeEvaluation, sanitizeNestedPaths, sanitizeProjectsForReport, type BenchmarkRun, type ComparisonResult, type FinalEvaluation, type ProjectResult, type RequirementMatrixEntry } from "@agentbench/shared";
import type { RunStorage } from "../storage/run-storage";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
const formatMs = (value?: number) => typeof value === "number" ? `${Math.round(value)} ms` : "—";
const formatScore = (value: unknown) => typeof value === "number" ? value.toFixed(1) : value === null ? "不可评分" : String(value ?? "—");

function statusLabel(status: string): string {
  return ({ passed: "通过", partial: "部分通过", failed: "失败", untested: "未测试", completed: "已完成", skipped: "已跳过" } as Record<string, string>)[status] ?? status;
}

function evaluationForRun(run: BenchmarkRun): FinalEvaluation {
  if (!run.results) throw new Error("评测尚未完成，无法生成报告");
  return run.results.evaluation ?? finalizeEvaluation({
    projectResults: run.results.projectResults,
    scores: run.results.scores,
    requirementMatrix: run.results.requirementMatrix,
    requirements: run.requirements,
    testCases: run.testCases,
    projectNames: { "project-a": run.projects[0].name, "project-b": run.projects[1].name }
  });
}

async function screenshotData(runDirectory: string, relativePath: string): Promise<string | undefined> {
  try {
    const data = await readFile(path.join(runDirectory, ...relativePath.split("/")));
    return `data:image/png;base64,${data.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function scoreRows(result: ComparisonResult): string {
  const labels: Array<[keyof typeof result.scores["project-a"], string]> = [
    ["total", "综合评分"], ["verifiedPassRate", "验证通过率"], ["requirementCoverage", "需求覆盖率"], ["effectiveRequirementScore", "有效需求得分"],
    ["criticalInteractions", "关键交互"], ["stability", "运行稳定性"], ["performance", "性能"],
    ["responsive", "响应式"], ["accessibility", "无障碍"], ["baseQuality", "基础质量"]
  ];
  labels.push(["executionCoverage", "执行覆盖率"], ["assertionCoverage", "断言覆盖率"], ["strongEvidenceCoverage", "强证据覆盖率"]);
  return labels.map(([key, label]) => `<tr><th>${label}</th><td>${formatScore(result.scores["project-a"][key])}</td><td>${formatScore(result.scores["project-b"][key])}</td></tr>`).join("");
}

function matrixRows(matrix: RequirementMatrixEntry[]): string {
  return matrix.map((entry) => `<tr><td><strong>${escapeHtml(entry.requirement.id)}</strong><br>${escapeHtml(entry.requirement.title)}<small>${escapeHtml(entry.requirement.priority)}</small></td><td>${entry.testCaseIds.map(escapeHtml).join(", ") || "无关联测试"}</td><td><span class="status ${entry.projectA.status}">${statusLabel(entry.projectA.status)}</span><small>${entry.projectA.evidence.length} 项证据</small></td><td><span class="status ${entry.projectB.status}">${statusLabel(entry.projectB.status)}</span><small>${entry.projectB.evidence.length} 项证据</small></td></tr>`).join("");
}

function projectDetails(project: ProjectResult, name: string): string {
  const errors = project.browserLogs.filter((log) => log.type === "error" || log.type === "pageerror");
  return `<section><h2>${escapeHtml(name)}</h2>
    <div class="metrics"><div><small>状态</small><strong>${statusLabel(project.status)}</strong></div><div><small>启动</small><strong>${formatMs(project.metrics.startupDurationMs)}</strong></div><div><small>页面加载</small><strong>${formatMs(project.metrics.pageLoadDurationMs)}</strong></div><div><small>浏览器错误</small><strong>${errors.length}</strong></div></div>
    <h3>测试用例</h3><table><thead><tr><th>测试</th><th>需求</th><th>状态</th><th>耗时</th><th>错误</th></tr></thead><tbody>${project.testCases.map((item) => `<tr><td>${escapeHtml(item.testCaseId)}</td><td>${escapeHtml(item.requirementId)}</td><td><span class="status ${item.status}">${statusLabel(item.status)}</span></td><td>${formatMs(item.durationMs)}</td><td>${escapeHtml(item.error ?? "—")}</td></tr>`).join("") || "<tr><td colspan=5>未执行测试</td></tr>"}</tbody></table>
    <h3>浏览器错误与网络失败</h3><ul>${[...errors.map((log) => `${log.type}: ${log.message}`), ...project.requestFailures.map((failure) => `${failure.method} ${failure.url}: ${failure.reason}`)].map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>未发现错误</li>"}</ul>
    <h3>响应式结果</h3><table><thead><tr><th>视口</th><th>文档宽度</th><th>视口宽度</th><th>横向溢出</th></tr></thead><tbody>${project.responsive.map((item) => `<tr><td>${escapeHtml(item.viewport)}</td><td>${item.documentWidth}px</td><td>${item.viewportWidth}px</td><td>${item.hasHorizontalOverflow ? `${item.overflowAmount}px` : "无"}</td></tr>`).join("") || "<tr><td colspan=4>无结果</td></tr>"}</tbody></table>
    <h3>axe / Lighthouse</h3><p>axe：${project.accessibility ? `${statusLabel(project.accessibility.status)}，${project.accessibility.violationCount} 项问题（严重 ${project.accessibility.seriousCount} / 致命 ${project.accessibility.criticalCount}）` : "未执行"}</p><p>Lighthouse：${project.lighthouse ? `${statusLabel(project.lighthouse.status)}${project.lighthouse.reason ? ` · ${escapeHtml(project.lighthouse.reason)}` : ""}` : "未执行"}</p>
  </section>`;
}

export async function generateHtmlReport(run: BenchmarkRun): Promise<string> {
  if (!run.results) throw new Error("评测尚未完成，无法生成报告");
  const result = run.results;
  const evaluation = evaluationForRun(run);
  const projects = sanitizeProjectsForReport(run.projects, run.settings.includeAbsolutePaths);
  const report = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(run.name)} · AgentBench Studio</title><style>
  :root{color-scheme:dark;font-family:"Segoe UI",sans-serif;background:#070b14;color:#dce7f5}*{box-sizing:border-box}body{margin:0;padding:36px;background:#070b14;line-height:1.55}main{max-width:1180px;margin:auto}.header{border:1px solid #253249;background:#0b1220;padding:28px;border-radius:18px}.eyebrow,small{display:block;color:#7f93ad;font-size:12px;letter-spacing:.08em;text-transform:uppercase}h1{margin:8px 0;font-size:30px}h2{margin-top:34px;border-bottom:1px solid #253249;padding-bottom:10px}h3{color:#a9bad0}.recommendation{margin:20px 0;padding:20px;border-left:4px solid #4f8cff;background:#101827}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.metrics div{padding:14px;background:#0b1220;border:1px solid #253249;border-radius:10px}.metrics strong{display:block;font-size:20px}table{width:100%;border-collapse:collapse;margin:12px 0 22px}th,td{padding:11px;border:1px solid #253249;text-align:left;vertical-align:top}th{background:#101827}.status{display:inline-block;padding:2px 8px;border-radius:999px;background:#172239}.passed,.completed{color:#22c55e}.partial,.skipped{color:#f59e0b}.failed{color:#ef4444}.untested{color:#94a3b8}.screens{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.screens figure{margin:0;padding:10px;background:#0b1220;border:1px solid #253249}.screens img{width:100%;height:auto}pre{white-space:pre-wrap;background:#030711;border:1px solid #253249;padding:18px;overflow:auto}@media(max-width:760px){body{padding:14px}.metrics,.screens{grid-template-columns:1fr 1fr}table{font-size:12px}}
  </style></head><body><main><div class="header"><span class="eyebrow">AgentBench Studio · 独立本地报告</span><h1>${escapeHtml(run.name)}</h1><p>${escapeHtml(run.description ?? "双项目质量评测")}</p><p>创建：${escapeHtml(run.createdAt)} · 完成：${escapeHtml(run.completedAt ?? result.generatedAt)}</p></div>
  <div class="recommendation"><span class="eyebrow">${evaluation.releaseJudgement === "blocked" ? "当前版本存在发布阻断" : evaluation.comparable ? "建议继续开发的基础版本" : "不可比较"}</span><h2>${escapeHtml(evaluation.recommendedProjectName)}</h2><ul>${evaluation.recommendationReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></div>
  <section><h2>评测可信度与发布判断</h2><div class="metrics"><div><small>强证据覆盖率</small><strong>${evaluation.strongEvidenceCoverage.toFixed(1)}%</strong></div><div><small>评测置信度</small><strong>${escapeHtml(evaluation.confidence)}</strong></div><div><small>发布判断</small><strong>${escapeHtml(evaluation.releaseJudgement)}</strong></div><div><small>可比较</small><strong>${evaluation.comparable ? "是" : "否"}</strong></div></div><ul>${[...evaluation.confidenceReasons, ...evaluation.releaseReasons].map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul><p>达到发布条件的项目：${evaluation.releaseRecommendedProject ? escapeHtml(run.projects[evaluation.releaseRecommendedProject === "project-a" ? 0 : 1].name) : "无"}</p></section>
  <section><h2>项目配置</h2><table><thead><tr><th></th><th>Project A</th><th>Project B</th></tr></thead><tbody><tr><th>名称</th><td>${escapeHtml(projects[0].name)}</td><td>${escapeHtml(projects[1].name)}</td></tr><tr><th>来源 Agent</th><td>${escapeHtml(projects[0].sourceAgent ?? "—")}</td><td>${escapeHtml(projects[1].sourceAgent ?? "—")}</td></tr><tr><th>项目目录</th><td>${escapeHtml(projects[0].localPath)}</td><td>${escapeHtml(projects[1].localPath)}</td></tr></tbody></table></section>
  <section><h2>评分对比</h2><table><thead><tr><th>维度</th><th>${escapeHtml(run.projects[0].name)}</th><th>${escapeHtml(run.projects[1].name)}</th></tr></thead><tbody>${scoreRows(result)}</tbody></table><p>性能标记为估算时，使用页面加载和启动耗时的固定降级规则。评分上限：A ${escapeHtml(result.scores["project-a"].capReasons.join("；") || "无")}；B ${escapeHtml(result.scores["project-b"].capReasons.join("；") || "无")}。</p><h3>评分解释</h3><pre>${escapeHtml(JSON.stringify({ "project-a": result.scores["project-a"].explanations, "project-b": result.scores["project-b"].explanations }, null, 2))}</pre></section>
  <section><h2>需求追踪矩阵</h2><p>未测试不等于失败；没有测试证据不能判定需求已实现。</p><table><thead><tr><th>需求</th><th>关联测试</th><th>Project A</th><th>Project B</th></tr></thead><tbody>${matrixRows(result.requirementMatrix)}</tbody></table></section>
  ${projectDetails(result.projectResults[0], projects[0].name)}${projectDetails(result.projectResults[1], projects[1].name)}
  <section><h2>未执行检测</h2><h3>Project A</h3><p>${escapeHtml(result.scores["project-a"].unexecutedChecks.join("、") || "全部执行")}</p><h3>Project B</h3><p>${escapeHtml(result.scores["project-b"].unexecutedChecks.join("、") || "全部执行")}</p></section>
  <section><h2>分级阻断问题</h2><ul>${evaluation.blockers.map((item) => `<li><strong>[${escapeHtml(item.severity.toUpperCase())}]</strong> ${escapeHtml(item.projectId ?? "global")} · ${escapeHtml(item.source)} · ${escapeHtml(item.message)}</li>`).join("") || "<li>无</li>"}</ul></section>
  <section><h2>截图证据</h2><div class="screens" data-screenshot-placeholder></div></section>
  <section><h2>下一轮修改任务</h2><pre>${escapeHtml(evaluation.nextIterationPrompt)}</pre></section>
  <section><h2>原始结果文件索引</h2><ul><li>result.json</li><li>score.json</li><li>requirement-matrix.json</li><li>reports/report.json</li><li>logs/project-a.log</li><li>logs/project-b.log</li></ul></section>
  </main></body></html>`;
  return sanitizeNestedPaths(report, run.settings.includeAbsolutePaths);
}

export async function embedReportScreenshots(html: string, run: BenchmarkRun, runDirectory: string): Promise<string> {
  if (!run.results) return html;
  const figures: string[] = [];
  for (const project of run.results.projectResults) {
    for (const artifact of project.artifacts.filter((item) => item.type === "screenshot")) {
      const data = await screenshotData(runDirectory, artifact.relativePath);
      if (data) figures.push(`<figure><img src="${data}" alt="${escapeHtml(artifact.label)}"><figcaption>${escapeHtml(project.projectId)} · ${escapeHtml(artifact.label)} · ${escapeHtml(artifact.viewport ?? "")}</figcaption></figure>`);
    }
  }
  return html.replace("<div class=\"screens\" data-screenshot-placeholder></div>", `<div class="screens">${figures.join("") || "<p>无截图</p>"}</div>`);
}

export function generateMarkdownReport(run: BenchmarkRun): string {
  if (!run.results) throw new Error("评测尚未完成，无法生成报告");
  const result = run.results;
  const evaluation = evaluationForRun(run);
  const projects = sanitizeProjectsForReport(run.projects, run.settings.includeAbsolutePaths);
  const lines = [
    `# ${run.name}`,
    "", `> AgentBench Studio 本地评测报告 · ${run.completedAt ?? result.generatedAt}`, "",
    evaluation.comparable ? "## 建议继续开发的基础版本" : "## 不可比较", "", `**${evaluation.recommendedProjectName}**`, "",
    ...evaluation.recommendationReasons.map((reason) => `- ${reason}`), "",
    "## 评测可信度与发布判断", "",
    `- 执行覆盖率：${evaluation.executionCoverage.toFixed(1)}%`, `- 断言覆盖率：${evaluation.assertionCoverage.toFixed(1)}%`, `- 强证据覆盖率：${evaluation.strongEvidenceCoverage.toFixed(1)}%`,
    `- 评测置信度：${evaluation.confidence}`, `- 发布判断：${evaluation.releaseJudgement}`, `- 可比较：${evaluation.comparable ? "是" : "否"}`,
    `- 达到发布条件的项目：${evaluation.releaseRecommendedProject ?? "无"}`, ...evaluation.confidenceReasons.map((reason) => `- ${reason}`), "",
    "## 项目配置", "", "| 项目 | 名称 | 本地目录 |", "| --- | --- | --- |",
    `| Project A | ${projects[0].name} | ${projects[0].localPath} |`,
    `| Project B | ${projects[1].name} | ${projects[1].localPath} |`, "",
    "## 评分", "", "| 维度 | Project A | Project B |", "| --- | ---: | ---: |",
    `| 综合 | ${formatScore(result.scores["project-a"].total)} | ${formatScore(result.scores["project-b"].total)} |`,
    `| 验证通过率 | ${result.scores["project-a"].verifiedPassRate} | ${result.scores["project-b"].verifiedPassRate} |`,
    `| 需求覆盖率 | ${result.scores["project-a"].requirementCoverage} | ${result.scores["project-b"].requirementCoverage} |`,
    `| 有效需求得分 | ${result.scores["project-a"].effectiveRequirementScore} | ${result.scores["project-b"].effectiveRequirementScore} |`,
    `| 关键交互 | ${result.scores["project-a"].criticalInteractions} | ${result.scores["project-b"].criticalInteractions} |`,
    `| 稳定性 | ${result.scores["project-a"].stability} | ${result.scores["project-b"].stability} |`, "",
    "### 未执行检测", "", `- Project A：${result.scores["project-a"].unexecutedChecks.join("、") || "全部执行"}`, `- Project B：${result.scores["project-b"].unexecutedChecks.join("、") || "全部执行"}`, "",
    "## 需求追踪矩阵", "", "| 需求 | 测试 | Project A | Project B |", "| --- | --- | --- | --- |",
    ...result.requirementMatrix.map((entry) => `| ${entry.requirement.id} ${entry.requirement.title} | ${entry.testCaseIds.join(", ") || "无"} | ${entry.projectA.status} | ${entry.projectB.status} |`), "",
    "## 评分解释", "", "```json", JSON.stringify({ "project-a": result.scores["project-a"].explanations, "project-b": result.scores["project-b"].explanations }, null, 2), "```", "",
    "## 分级阻断问题", "", ...(evaluation.blockers.length ? evaluation.blockers.map((item) => `- [${item.severity.toUpperCase()}] ${item.projectId ?? "global"} · ${item.source} · ${item.message}`) : ["- 无"]), "",
    "## 下一轮修改任务", "", "```text", evaluation.nextIterationPrompt, "```", "",
    "## 证据索引", "", ...result.projectResults.flatMap((project) => project.artifacts.map((artifact) => `- ${project.projectId}: ${artifact.relativePath}`))
  ];
  return sanitizeNestedPaths(lines.join("\n"), run.settings.includeAbsolutePaths);
}

export function generateJsonReport(run: BenchmarkRun): string {
  if (!run.results) throw new Error("评测尚未完成，无法生成报告");
  const projects = sanitizeProjectsForReport(run.projects, run.settings.includeAbsolutePaths);
  const evaluation = evaluationForRun(run);
  const report = {
    reportVersion: "1.2",
    run: { id: run.id, name: run.name, description: run.description, createdAt: run.createdAt, completedAt: run.completedAt, projects },
    results: { ...run.results, evaluation }
  };
  return `${JSON.stringify(sanitizeNestedPaths(report, run.settings.includeAbsolutePaths), null, 2)}\n`;
}

export async function writeReports(storage: RunStorage, run: BenchmarkRun): Promise<void> {
  const runDirectory = storage.runDirectory(run.id);
  const baseHtml = await generateHtmlReport(run);
  const html = await embedReportScreenshots(baseHtml, run, runDirectory);
  await Promise.all([
    storage.writeReport(run.id, "report.html", html),
    storage.writeReport(run.id, "report.md", generateMarkdownReport(run)),
    storage.writeReport(run.id, "report.json", generateJsonReport(run))
  ]);
}

export function reportFileName(format: "html" | "markdown" | "json"): string {
  return format === "markdown" ? "report.md" : `report.${format}`;
}
