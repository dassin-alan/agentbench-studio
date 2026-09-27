import { describe, expect, it } from "vitest";
import { formatRunValidationIssues } from "./validation-errors";

describe("run form validation messages", () => {
  it("turns the empty run name Zod issue into an actionable Chinese message", () => {
    expect(formatRunValidationIssues([
      { path: ["name"], message: "String must contain at least 1 character(s)" },
    ])).toBe("请填写评测名称（例如：AI 工具目录双项目评测）。");
  });

  it("identifies project paths without exposing raw schema wording", () => {
    expect(formatRunValidationIssues([
      { path: ["projects", 0, "localPath"], message: "String must contain at least 1 character(s)" },
      { path: ["projects", 1, "localPath"], message: "String must contain at least 1 character(s)" },
    ])).toBe("请填写项目 A 的本地路径；请填写项目 B 的本地路径。");
  });
});
