import type { BenchmarkRun, BenchmarkRunInput, ProjectDetectionResult } from "@agentbench/shared";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options?.body ? { "Content-Type": "application/json" } : {}), ...options?.headers }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: `${response.status} ${response.statusText}` })) as { message?: string };
    throw new Error(payload.message || `${response.status} ${response.statusText}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ ok: boolean; timestamp: string }>("/api/health"),
  listRuns: () => request<BenchmarkRun[]>("/api/runs"),
  getRun: (id: string) => request<BenchmarkRun>(`/api/runs/${id}`),
  demoConfig: () => request<BenchmarkRunInput>("/api/demo/config"),
  createRun: (input: BenchmarkRunInput) => request<BenchmarkRun>("/api/runs", { method: "POST", body: JSON.stringify(input) }),
  updateRun: (id: string, input: BenchmarkRunInput) => request<BenchmarkRun>(`/api/runs/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  startRun: (id: string) => request<BenchmarkRun>(`/api/runs/${id}/start`, { method: "POST" }),
  cancelRun: (id: string) => request<BenchmarkRun>(`/api/runs/${id}/cancel`, { method: "POST" }),
  deleteRun: (id: string) => request<void>(`/api/runs/${id}`, { method: "DELETE" }),
  detectProject: (localPath: string) => request<ProjectDetectionResult>("/api/projects/detect", { method: "POST", body: JSON.stringify({ path: localPath }) })
};

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function artifactUrl(runId: string, relativePath: string): string {
  return `/api/runs/${runId}/artifacts/${relativePath.replace(/^artifacts\//, "").split("/").map(encodeURIComponent).join("/")}`;
}
