import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectProject } from "../runner/project-detection";

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("project detection path handling", () => {
  it("detects a project directory when its copied path is wrapped in quotes", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "agentbench-detect-"));
    temporaryPaths.push(directory);
    await writeFile(path.join(directory, "package.json"), JSON.stringify({ scripts: { dev: "vite" }, devDependencies: { vite: "latest" } }), "utf8");

    const result = await detectProject(`"${directory}"`);

    expect(result.exists).toBe(true);
    expect(result.hasPackageJson).toBe(true);
    expect(result.framework).toBe("vite");
  });

  it("returns an actionable extraction message for a ZIP file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "agentbench-detect-"));
    temporaryPaths.push(directory);
    const zipPath = path.join(directory, "candidate.zip");
    await writeFile(zipPath, "not needed for type detection", "utf8");

    const result = await detectProject(`"${zipPath}"`);

    expect(result.exists).toBe(true);
    expect(result.hasPackageJson).toBe(false);
    expect(result.error).toContain("ZIP");
    expect(result.error).toContain("解压");
  });

  it("recognizes a standalone HTML file as a runnable static project", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "agentbench-detect-"));
    temporaryPaths.push(directory);
    const htmlPath = path.join(directory, "candidate.html");
    await writeFile(htmlPath, "<!doctype html><title>Single file</title><main>ready</main>", "utf8");

    const result = await detectProject(htmlPath);

    expect(result.exists).toBe(true);
    expect(result.framework).toBe("static");
    expect(result.suggestedStartCommand).toBe("agentbench:serve-html");
    expect(result.error).toBeUndefined();
  });
});
