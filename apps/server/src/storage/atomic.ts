import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const writeQueues = new Map<string, Promise<void>>();

const delay = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs));

async function replaceFile(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await rename(temporaryPath, filePath);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EPERM" && code !== "EACCES" && code !== "EEXIST") throw error;
        if (attempt === 7) throw error;
        await delay(20 * (attempt + 1));
      }
    }
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function writeTextAtomic(filePath: string, content: string): Promise<void> {
  const key = path.resolve(filePath).toLowerCase();
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(() => replaceFile(filePath, content));
  writeQueues.set(key, current);
  try {
    await current;
  } finally {
    if (writeQueues.get(key) === current) writeQueues.delete(key);
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
