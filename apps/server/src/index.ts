import { buildApp } from "./app";

const production = process.argv.includes("--production");
const app = await buildApp({ serveWeb: production });
try {
  const port = production ? 3000 : 3001;
  await app.listen({ host: "127.0.0.1", port });
  console.log(`AgentBench Studio ${production ? "production" : "server"} running at http://127.0.0.1:${port}`);
} catch (error) {
  console.error(error);
  await app.close();
  process.exit(1);
}
