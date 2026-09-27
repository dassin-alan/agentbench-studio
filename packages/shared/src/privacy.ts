import type { ProjectConfig } from "./types";

export function redactProjectPath(value: string, includeAbsolutePaths = false): string {
  if (includeAbsolutePaths) return value;
  const normalized = value.trim().replace(/[\\/]+$/, "");
  const name = normalized.split(/[\\/]/).filter(Boolean).at(-1);
  return name ?? "project";
}

export function sanitizeProjectsForReport(
  projects: [ProjectConfig, ProjectConfig],
  includeAbsolutePaths = false
): [ProjectConfig, ProjectConfig] {
  return projects.map((project) => ({
    ...project,
    localPath: redactProjectPath(project.localPath, includeAbsolutePaths),
    ...(project.workingDirectory ? { workingDirectory: redactProjectPath(project.workingDirectory, includeAbsolutePaths) } : {})
  })) as [ProjectConfig, ProjectConfig];
}

function redactPathsInString(value: string): string {
  const windowsPath = /[A-Za-z]:\\(?:[^\\\s"'<>|]+\\)+[^\\\s"'<>|]+/g;
  const posixPath = /\/(?:home|Users|mnt|tmp|var|opt)\/(?:[^/\s"'<>]+\/)+[^/\s"'<>]+/g;
  const replacePath = (match: string) => `<redacted>/${match.split(/[\\/]/).filter(Boolean).at(-1) ?? "path"}`;
  return value.replace(windowsPath, replacePath).replace(posixPath, replacePath);
}

export function sanitizeNestedPaths<T>(value: T, includeAbsolutePaths = false): T {
  if (includeAbsolutePaths) return value;
  if (typeof value === "string") return redactPathsInString(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeNestedPaths(item, false)) as T;
  if (value && typeof value === "object") {
    const sanitized = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeNestedPaths(item, false)]));
    return sanitized as T;
  }
  return value;
}
