import path from "node:path";

function decodePath(value: string): string {
  let decoded = value;
  for (let index = 0; index < 2; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      throw new Error("Invalid encoded path");
    }
  }
  return decoded;
}

export function safeResolve(baseDirectory: string, requestedPath: string): string {
  const decoded = decodePath(requestedPath).replaceAll("\\", path.sep).replaceAll("/", path.sep);
  if (decoded.includes("\0") || path.isAbsolute(decoded)) throw new Error("Path traversal outside the allowed directory is blocked");
  const base = path.resolve(baseDirectory);
  const resolved = path.resolve(base, decoded);
  const relative = path.relative(base, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Path traversal outside the allowed directory is blocked");
  return resolved;
}
