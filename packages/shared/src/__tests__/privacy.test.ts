import { describe, expect, it } from "vitest";
import { redactProjectPath, sanitizeNestedPaths, sanitizeProjectsForReport } from "../privacy";
import type { ProjectConfig } from "../types";

const project = (id: ProjectConfig["id"], localPath: string): ProjectConfig => ({
  id,
  name: id,
  localPath,
  startCommand: "npm run dev",
  port: id === "project-a" ? 4173 : 4174,
  baseUrl: `http://127.0.0.1:${id === "project-a" ? 4173 : 4174}`,
  startupTimeoutMs: 30_000
});

describe("report path privacy", () => {
  it("keeps only the project directory name for Windows and POSIX paths", () => {
    expect(redactProjectPath("C:\\Users\\private-user\\projects\\demo-a", false)).toBe("demo-a");
    expect(redactProjectPath("/home/private-user/projects/demo-b/", false)).toBe("demo-b");
  });

  it("redacts absolute paths in deeply nested result strings", () => {
    const input = {
      startup: { error: "Failed in C:\\Users\\private-user\\projects\\alpha\\src\\main.ts" },
      logs: [{ message: "See X:\\private-output\\secret-project\\error.log" }],
      nested: { prompt: "修复 /home/private-user/projects/beta/src/App.tsx" }
    };
    const sanitized = sanitizeNestedPaths(input, false);
    const text = JSON.stringify(sanitized);
    expect(text).not.toContain("private-user");
    expect(text).not.toContain("X:\\\\private-output");
    expect(text).toContain("main.ts");
    expect(text).toContain("error.log");
    expect(text).toContain("App.tsx");
  });

  it("preserves absolute paths only after explicit opt in", () => {
    const projects: [ProjectConfig, ProjectConfig] = [
      project("project-a", "C:\\Users\\private-user\\demo-a"),
      project("project-b", "/home/private-user/demo-b")
    ];
    expect(sanitizeProjectsForReport(projects, false).map((item) => item.localPath)).toEqual(["demo-a", "demo-b"]);
    expect(sanitizeProjectsForReport(projects, true)).toEqual(projects);
  });
});
