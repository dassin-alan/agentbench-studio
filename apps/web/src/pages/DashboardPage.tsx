import { useEffect, useState } from "react";
import { ArrowRight, Clock3, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { finalizeEvaluation, type BenchmarkRun } from "@agentbench/shared";
import { api, messageOf } from "../services/api";
import { EmptyState, ErrorNotice, PageHeader, StatusBadge } from "../components/Ui";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function DashboardPage() {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<BenchmarkRun | null>(null);
  const load = () => api.listRuns().then(setRuns).catch((value) => setError(messageOf(value))).finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);
  const remove = async (run: BenchmarkRun) => {
    try { await api.deleteRun(run.id); await load(); } catch (value) { setError(messageOf(value)); }
  };
  const evaluationOf = (run: BenchmarkRun) => run.results ? run.results.evaluation ?? finalizeEvaluation({ projectResults: run.results.projectResults, scores: run.results.scores, requirementMatrix: run.results.requirementMatrix, requirements: run.requirements, testCases: run.testCases, projectNames: { "project-a": run.projects[0].name, "project-b": run.projects[1].name } }) : null;
  const scoreText = (run: BenchmarkRun) => { const evaluation = evaluationOf(run); return evaluation?.comparable && evaluation.recommendedProjectId ? `${evaluation.decisionScore?.toFixed(1) ?? "不可评分"} / 100` : "不可比较"; };
  const resultText = (run: BenchmarkRun) => evaluationOf(run)?.recommendedProjectName ?? "等待结果";
  const runActions = (run: BenchmarkRun) => <div className="row-actions"><Link aria-label={`查看 ${run.name}`} title="进入详情" to={run.status === "completed" ? `/runs/${run.id}/results` : `/runs/${run.id}`}><ArrowRight /></Link><button aria-label={`删除 ${run.name}`} title="删除" onClick={() => setPendingDelete(run)} disabled={run.status === "running" || run.status === "queued"}><Trash2 /></button></div>;

  const completed = runs.filter((run) => run.status === "completed").length;
  const active = runs.filter((run) => run.status === "running" || run.status === "queued").length;
  return <motion.div className="page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <PageHeader eyebrow="LOCAL BENCHMARK WORKSPACE" title="评测工作台" description="用相同测试和可追踪证据比较两个前端项目。" actions={<Link className="button primary" to="/runs/new"><Plus size={17} />新建评测</Link>} />
    {error && <ErrorNotice message={error} />}
    <section className="summary-strip"><div><small>本地评测</small><strong>{runs.length.toString().padStart(2, "0")}</strong></div><div><small>已完成</small><strong>{completed.toString().padStart(2, "0")}</strong></div><div><small>正在运行</small><strong>{active.toString().padStart(2, "0")}</strong></div><div className="system-ready"><i />API READY <span>127.0.0.1:3001</span></div></section>
    <section className="panel run-list-panel">
      <div className="panel-heading"><div><span className="eyebrow">RECENT RUNS</span><h2>最近评测</h2></div><span>{runs.length} 条本地记录</span></div>
      {loading ? <div className="loading-line">正在读取本地运行记录…</div> : runs.length === 0 ? <EmptyState title="还没有评测记录" body="加载内置示例即可完成第一次真实端到端对比。" action={<Link className="button primary" to="/runs/new">创建第一次评测</Link>} /> : <><div className="run-table-wrap"><table className="run-table"><thead><tr><th>评测</th><th>状态</th><th>候选项目</th><th>结论</th><th>创建时间</th><th></th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td><strong>{run.name}</strong><small>{run.id.slice(0, 8)} · {run.testCases.length} TESTS</small></td><td><StatusBadge status={run.status} /></td><td>{run.projects[0].name}<br /><span>vs {run.projects[1].name}</span></td><td>{run.results ? <><strong className="accent">{resultText(run)}</strong><small>{scoreText(run)}</small></> : <span>等待结果</span>}</td><td><Clock3 size={13} /> {new Date(run.createdAt).toLocaleString("zh-CN")}</td><td>{runActions(run)}</td></tr>)}</tbody></table></div><div className="run-card-list">{runs.map((run) => <article className="run-mobile-card" key={run.id}><header><div><strong>{run.name}</strong><small>{run.id.slice(0, 8)} · {run.testCases.length} TESTS</small></div><StatusBadge status={run.status} /></header><dl><div><dt>Project A</dt><dd>{run.projects[0].name}</dd></div><div><dt>Project B</dt><dd>{run.projects[1].name}</dd></div><div><dt>推荐结果</dt><dd className="accent">{resultText(run)}<small>{run.results ? scoreText(run) : ""}</small></dd></div><div><dt>创建时间</dt><dd>{new Date(run.createdAt).toLocaleString("zh-CN")}</dd></div></dl><footer>{runActions(run)}</footer></article>)}</div></>}
    </section>
    <ConfirmDialog open={Boolean(pendingDelete)} title="删除评测与全部证据？" message={pendingDelete ? `“${pendingDelete.name}”的配置、日志、截图和报告将从本地永久删除。` : ""} confirmLabel="确认删除" danger onCancel={() => setPendingDelete(null)} onConfirm={() => { const run = pendingDelete; setPendingDelete(null); if (run) void remove(run); }} />
  </motion.div>;
}
