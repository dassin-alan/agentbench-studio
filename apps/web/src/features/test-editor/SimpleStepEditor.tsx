import { GripVertical, Plus, Trash2 } from "lucide-react";
import type { TestStep } from "@agentbench/shared";
import { createStep, STEP_ACTIONS } from "./step-factory";

type Props = { steps: TestStep[]; onChange: (steps: TestStep[]) => void };

function StepFields({ step, onChange }: { step: TestStep; onChange: (step: TestStep) => void }) {
  switch (step.action) {
    case "goto": return <label>路径<input value={step.path} onChange={(event) => onChange({ ...step, path: event.target.value })} /></label>;
    case "click":
    case "expectVisible":
    case "expectHidden": return <label>Selector<input value={step.selector} onChange={(event) => onChange({ ...step, selector: event.target.value })} /></label>;
    case "fill": return <><label>Selector<input value={step.selector} onChange={(event) => onChange({ ...step, selector: event.target.value })} /></label><label>填充值<input value={step.value} onChange={(event) => onChange({ ...step, value: event.target.value })} /></label></>;
    case "press": return <><label>Selector（可选）<input value={step.selector ?? ""} onChange={(event) => onChange(event.target.value ? { ...step, selector: event.target.value } : { action: "press", key: step.key })} /></label><label>按键<input value={step.key} onChange={(event) => onChange({ ...step, key: event.target.value })} /></label></>;
    case "waitFor": return <><label>Selector<input value={step.selector} onChange={(event) => onChange({ ...step, selector: event.target.value })} /></label><label>状态<select value={step.state ?? "visible"} onChange={(event) => onChange({ ...step, state: event.target.value as "visible" | "hidden" | "attached" })}><option value="visible">visible</option><option value="hidden">hidden</option><option value="attached">attached</option></select></label><label>超时 ms<input type="number" value={step.timeoutMs ?? 5_000} onChange={(event) => onChange({ ...step, timeoutMs: Number(event.target.value) })} /></label></>;
    case "expectText": return <><label>Selector<input value={step.selector} onChange={(event) => onChange({ ...step, selector: event.target.value })} /></label><label>期望文本<input value={step.value} onChange={(event) => onChange({ ...step, value: event.target.value })} /></label><label className="inline-check"><input type="checkbox" checked={step.exact ?? false} onChange={(event) => onChange({ ...step, exact: event.target.checked })} />精确匹配</label></>;
    case "expectUrl": return <><label>URL 值<input value={step.value} onChange={(event) => onChange({ ...step, value: event.target.value })} /></label><label>匹配方式<select value={step.mode ?? "contains"} onChange={(event) => onChange({ ...step, mode: event.target.value as "equals" | "contains" })}><option value="contains">contains</option><option value="equals">equals</option></select></label></>;
    case "expectCount": return <><label>Selector<input value={step.selector} onChange={(event) => onChange({ ...step, selector: event.target.value })} /></label><label>数量<input type="number" min={0} value={step.count} onChange={(event) => onChange({ ...step, count: Number(event.target.value) })} /></label></>;
    case "screenshot": return <><label>截图名称<input value={step.name} onChange={(event) => onChange({ ...step, name: event.target.value })} /></label><label className="inline-check"><input type="checkbox" checked={step.fullPage ?? false} onChange={(event) => onChange({ ...step, fullPage: event.target.checked })} />完整页面</label></>;
    case "wait": return <label>等待 ms<input type="number" min={0} value={step.durationMs} onChange={(event) => onChange({ ...step, durationMs: Number(event.target.value) })} /></label>;
  }
}

export function SimpleStepEditor({ steps, onChange }: Props) {
  const update = (index: number, step: TestStep) => onChange(steps.map((item, itemIndex) => itemIndex === index ? step : item));
  return <div className="simple-step-editor">
    {steps.map((step, index) => <div className="simple-step-row" key={`${index}-${step.action}`}>
      <div className="step-index"><GripVertical /><span>{index + 1}</span></div>
      <label className="step-action">Action<select value={step.action} onChange={(event) => update(index, createStep(event.target.value as TestStep["action"]))}>{STEP_ACTIONS.map((action) => <option key={action}>{action}</option>)}</select></label>
      <div className="step-fields"><StepFields step={step} onChange={(next) => update(index, next)} /></div>
      <button className="icon-danger" type="button" aria-label={`删除步骤 ${index + 1}`} onClick={() => onChange(steps.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></button>
    </div>)}
    <button className="mini-button" type="button" onClick={() => onChange([...steps, createStep("click")])}><Plus />添加步骤</button>
  </div>;
}
