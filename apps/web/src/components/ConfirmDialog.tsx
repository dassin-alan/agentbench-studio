import { AlertTriangle, X } from "lucide-react";
import { useEffect } from "react";

export function ConfirmDialog({ open, title, message, confirmLabel, danger = false, onConfirm, onCancel }: { open: boolean; title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onCancel]);
  if (!open) return null;
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><button className="dialog-close" aria-label="关闭确认窗口" onClick={onCancel}><X /></button><AlertTriangle className={danger ? "danger-icon" : "warning-icon"} /><h2 id="confirm-title">{title}</h2><p>{message}</p><div><button className="button ghost" onClick={onCancel}>取消</button><button className={`button ${danger ? "danger" : "primary"}`} onClick={onConfirm}>{confirmLabel}</button></div></section></div>;
}

