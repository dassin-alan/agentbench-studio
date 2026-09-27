import path from "node:path";
import { describe, expect, it } from "vitest";
import { safeResolve } from "../utils/path-security";

describe("safeResolve", () => {
  it("allows files below the requested root", () => {
    const base = path.resolve("C:/temp/agentbench/run");
    expect(safeResolve(base, "artifacts/project-a/image.png")).toBe(path.join(base, "artifacts", "project-a", "image.png"));
  });

  it("blocks directory traversal", () => {
    const base = path.resolve("C:/temp/agentbench/run");
    expect(() => safeResolve(base, "../config.json")).toThrow(/outside|traversal/i);
    expect(() => safeResolve(base, "%2e%2e%2fconfig.json")).toThrow(/outside|traversal/i);
  });
});
