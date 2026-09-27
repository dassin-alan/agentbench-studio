import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Camera, CheckCircle2, Clock3, ExternalLink, ServerCog, TerminalSquare } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import type { BenchmarkRun, RunEvent } from "@agentbench/shared";
import { api, messageOf } from "../services/api";
import { ErrorNotice, PageHeader, StatusBadge } from "../components/Ui";
import { ConfirmDialog } from "../components/ConfirmDialog";

type LogLine = { time: string; level: string; message: string; projectId?: string };

export function RunPage() {
  const { id = "" } = useParams();
  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const load = useCallback(() => api.getRun(id).then(setRun).catch((value) => setError(messageOf(value))), [id]);

  useEffect(() => {
    void load();
    const source = new EventSource(`/api/runs/${id}/events`);
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as RunEvent;
        if (event.type === "log") setLogs((current) => [...current.slice(-249), { time: new Date().toLocaleTimeString("zh-CN", { hour12: false }), level: event.level, message: event.message, ...(event.projectId ? { projectId: event.projectId } : {}) }]);
        if (["stage", "progress", "completed", "cancelled", "error", "result"].includes(event.type)) void load();
      } catch { /* ignore malformed SSE frame */ }
    };
    source.onerror = () => { source.close(); };
    const poll = window.setInterval(() => void load(), 2_000);
    return () => { source.close(); window.clearInterval(poll); };
  }, [id, load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (run?.startedAt) setElapsed(Date.now() - new Date(run.startedAt).getTime()); }, 1_000);
    return () => window.clearInterval(timer);
  }, [run?.startedAt]);

  const progress = run ? Math.round((run.progress.completed / Math.max(1, run.progress.total)) * 100) : 0;
  const screenshots = useMemo(() => run?.results?.projectResults.reduce((sum, project) => sum + project.artifacts.filter((artifact) => artifact.type === "screenshot").length, 0) ?? logs.filter((line) => line.message.includes("截图")).length, [run, logs]);
  const failed = run?.results?.projectResults.reduce((sum, project) => sum + project.testCases.filter((testCase) => testCase.status === "failed").length, 0) ?? logs.filter((line) => line.level === "error" && line.message.includes("TEST-")).length;
  const cancel = async () => { try { setError(""); setRun(await api.cancelRun(id)); } catch (value) { setError(messageOf(value)); } };

  return <motion.div className="page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <PageHeader eyebrow="LIVE TEST ORCHESTRATOR" title={run?.name ?? "测试运行中心"} description={run ? `${run.projects[0].name} 与 ${run.projects[1].name} 使用同一套 ${run.testCases.length} 个测试。` : "正在连接本地后端…"} actions={run && <StatusBadge status={run.status} />} />
    {error && <ErrorNotice message={error} />}
    {run && <>
      <section className="run-progress panel"><div className="progress-head"><div><span className="pulse-dot" /><div><small>当前阶段</small><strong>{run.progress.stage}</strong><p>{run.progress.message ?? "等待状态更新"}</p></div></div><strong>{progress}%</strong></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><div className="run-metrics"><div><Clock3 /><span><small>运行时长</small><strong>{Math.max(0, Math.round(elapsed / 1000))}s</strong></span></div><div><CheckCircle2 /><span><small>已完成阶段</small><strong>{run.progress.completed} / {run.progress.total}</strong></span></div><div><Ban /><span><small>失败测试</small><strong>{failed}</strong></span></div><div><Camera /><span><small>证据截图</small><strong>{screenshots}</strong></span></div></div></section>
      <section className="project-live-grid">{run.projects.map((project) => { const result = run.results?.projectResults.find((item) => item.projectId === project.id); const isCurrent = run.progress.projectId === project.id; return <article className={`panel project-live ${isCurrent ? "current" : ""}`} key={project.id}><div><span className="project-letter">{project.id === "project-a" ? "A" : "B"}</span><div><small>{project.sourceAgent ?? "UNSPECIFIED AGENT"}</small><h2>{project.name}</h2></div>{result ? <StatusBadge status={result.status} /> : <StatusBadge status={isCurrent ? "running" : run.progress.completed > (project.id === "project-a" ? 5 : 9) ? "completed" : "queued"} />}</div><dl><div><dt>BASE URL</dt><dd>{project.baseUrl}</dd></div><div><dt>COMMAND</dt><dd>{project.startCommand}</dd></div><div><dt>LOAD</dt><dd>{result?.metrics.pageLoadDurationMs ? `${result.metrics.pageLoadDurationMs} ms` : "—"}</dd></div><div><dt>ERRORS</dt><dd>{result?.browserLogs.filter((item) => item.type === "error" || item.type === "pageerror").length ?? "—"}</dd></div></dl></article>; })}</section>
      <section className="terminal-panel panel"><div className="terminal-head"><div><TerminalSquare />RUN LOG STREAM</div><span>SSE · {logs.length} events</span></div><div className="terminal-body">{logs.length === 0 ? <p className="terminal-empty">等待实时日志。页面刷新后状态会恢复，新日志从重新连接时继续。</p> : logs.map((line, index) => <div className={`terminal-line level-${line.level}`} key={`${line.time}-${index}`}><time>{line.time}</time><span>{line.projectId ? `[${line.projectId}]` : "[server]"}</span><p>{line.message}</p></div>)}</div></section>
      <footer className="run-footer"><div><ServerCog />任务结束或中止后，后端会清理项目进程树。</div><div>{(run.status === "running" || run.status === "queued") && <button className="button danger" onClick={() => setConfirmCancel(true)}><Ban />中止评测</button>}{run.status === "completed" && <Link className="button primary" to={`/runs/${run.id}/results`}>查看对比结果<ExternalLink /></Link>}{run.status === "failed" && <Link className="button ghost" to="/runs/new">检查配置并新建评测</Link>}</div></footer>
      <ConfirmDialog open={confirmCancel} title="确认中止正在运行的评测？" message="后端将立即停止测试并清理两个候选项目及浏览器进程；当前未完成结果不会生成正常评分。" confirmLabel="中止并清理" danger onCancel={() => setConfirmCancel(false)} onConfirm={() => { setConfirmCancel(false); void cancel(); }} />
    </>}
  </motion.div>;
}
