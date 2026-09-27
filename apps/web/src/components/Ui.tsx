import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";

export function StatusBadge({ status }: { status: string }) {
  const icon = status === "completed" || status === "passed" ? <CheckCircle2 /> : status === "failed" ? <XCircle /> : status === "partial" || status === "cancelled" ? <AlertTriangle /> : <CircleDashed />;
  const labels: Record<string, string> = { draft: "草稿", queued: "排队中", running: "运行中", completed: "已完成", failed: "失败", cancelled: "已中止", passed: "通过", partial: "部分通过", untested: "未测试", skipped: "已跳过" };
  return <span className={`status-badge status-${status}`}>{icon}{labels[status] ?? status}</span>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="header-actions">{actions}</div>}</header>;
}

export function ErrorNotice({ message }: { message: string }) {
  return <div className="error-notice"><AlertTriangle size={18} /><div><strong>操作未完成</strong><p>{message}</p></div></div>;
}

export function ScoreBar({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return <div className="score-row"><div><span>{label}</span><strong>{value.toFixed(1)}</strong></div><div className="score-track"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>{detail && <small>{detail}</small>}</div>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state"><CircleDashed /><h2>{title}</h2><p>{body}</p>{action}</div>;
}
