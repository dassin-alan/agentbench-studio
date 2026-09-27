import type { RunEvent } from "@agentbench/shared";

type Listener = (event: RunEvent) => void;

export class RunEventBus {
  private readonly listeners = new Map<string, Set<Listener>>();

  emit(runId: string, event: RunEvent): void {
    for (const listener of this.listeners.get(runId) ?? []) listener(event);
  }

  subscribe(runId: string, listener: Listener): () => void {
    const group = this.listeners.get(runId) ?? new Set<Listener>();
    group.add(listener);
    this.listeners.set(runId, group);
    return () => {
      group.delete(listener);
      if (group.size === 0) this.listeners.delete(runId);
    };
  }
}
