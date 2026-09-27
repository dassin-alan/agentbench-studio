import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const htmlFile = process.env.AGENTBENCH_HTML_FILE;
const port = Number(process.env.PORT);
if (!htmlFile || !Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("AGENTBENCH_HTML_FILE and a valid PORT are required");
}

const resolvedHtml = path.resolve(htmlFile);
const root = path.dirname(resolvedHtml);
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"],
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
  [".gif", "image/gif"], [".webp", "image/webp"], [".ico", "image/x-icon"],
  [".woff", "font/woff"], [".woff2", "font/woff2"],
]);

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    const relative = decodeURIComponent(requestUrl.pathname).replace(/^[/\\]+/, "");
    const candidate = relative ? path.resolve(root, relative) : resolvedHtml;
    const insideRoot = candidate === root || candidate.startsWith(`${root}${path.sep}`);
    if (!insideRoot || !(await stat(candidate)).isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    const content = await readFile(candidate);
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(candidate).toLowerCase()) ?? "application/octet-stream",
      "Cache-Control": "no-store",
    }).end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AgentBench static HTML server: http://127.0.0.1:${port}`);
});
const shutdown = () => server.close(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
