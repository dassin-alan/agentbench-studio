import { describe, expect, it } from "vitest";
import { BenchmarkRunInputSchema, ProjectDetectionRequestSchema, TestCaseSchema } from "../schemas";

const project = {
  id: "project-a",
  name: "Project A",
  localPath: "C:\\demo\\a",
  startCommand: "npm run dev",
  port: 4173,
  baseUrl: "http://127.0.0.1:4173",
  startupTimeoutMs: 30_000
};

describe("core schemas", () => {
  it("accepts a valid benchmark draft", () => {
    const parsed = BenchmarkRunInputSchema.parse({
      name: "Demo comparison",
      description: "same task",
      projects: [project, { ...project, id: "project-b", name: "Project B", port: 4174, baseUrl: "http://127.0.0.1:4174" }],
      requirements: [{ id: "REQ-001", title: "Search", priority: "must" }],
      testCases: [{
        id: "TEST-001",
        name: "Search tools",
        requirementId: "REQ-001",
        critical: true,
        steps: [
          { action: "goto", path: "/" },
          { action: "fill", selector: "[data-testid=search]", value: "Cursor" },
          { action: "expectCount", selector: "[data-testid=tool-card]", count: 1 }
        ]
      }],
      settings: {
        runInstall: false,
        runLighthouse: false,
        runAxe: true,
        testMobile: true,
        startupTimeoutMs: 30_000,
        stepTimeoutMs: 5_000
      }
    });

    expect(parsed.projects).toHaveLength(2);
    expect(parsed.settings.includeAbsolutePaths).toBe(false);
    expect(parsed.testCases[0]?.viewports).toEqual(["desktop"]);
  });

  it("accepts explicit laptop, tablet and mobile viewports without relying on requirement IDs", () => {
    const parsed = TestCaseSchema.parse({
      id: "TEST-MOBILE",
      name: "mobile on any requirement",
      requirementId: "REQ-OTHER",
      critical: false,
      viewports: ["laptop", "tablet", "mobile"],
      steps: [{ action: "expectVisible", selector: "main" }]
    });
    expect(parsed.viewports).toEqual(["laptop", "tablet", "mobile"]);
  });

  it("rejects executable JavaScript steps", () => {
    const parsed = TestCaseSchema.safeParse({
      id: "TEST-X",
      name: "unsafe",
      requirementId: "REQ-001",
      critical: true,
      steps: [{ action: "evaluate", code: "process.exit()" }]
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects projects with non-http base URLs", () => {
    const parsed = BenchmarkRunInputSchema.safeParse({
      name: "Bad URL",
      projects: [project, { ...project, id: "project-b", baseUrl: "file:///tmp/demo" }],
      requirements: [],
      testCases: [],
      settings: {
        runInstall: false,
        runLighthouse: false,
        runAxe: false,
        testMobile: false,
        startupTimeoutMs: 30_000,
        stepTimeoutMs: 5_000
      }
    });

    expect(parsed.success).toBe(false);
  });

  it("normalizes wrapping quotes copied with Windows project paths", () => {
    expect(ProjectDetectionRequestSchema.parse({ path: '  "D:\\Projects\\demo"  ' }).path).toBe("D:\\Projects\\demo");
    const parsed = BenchmarkRunInputSchema.parse({
      name: "Quoted paths",
      projects: [
        { ...project, localPath: '"C:\\demo\\a"' },
        { ...project, id: "project-b", name: "Project B", localPath: "'C:\\demo\\b'", port: 4174, baseUrl: "http://127.0.0.1:4174" },
      ],
      requirements: [],
      testCases: [],
      settings: { runInstall: false, runLighthouse: false, runAxe: false, testMobile: false, startupTimeoutMs: 30_000, stepTimeoutMs: 5_000 },
    });
    expect(parsed.projects[0].localPath).toBe("C:\\demo\\a");
    expect(parsed.projects[1].localPath).toBe("C:\\demo\\b");
  });
});
