const { createServer } = require("node:http");

const { createApp } = require("./src/http/app");
const { env } = require("./src/config/env");
const { closePostgresPool } = require("./src/config/postgres");
const { closeRedisClient } = require("./src/config/redis");

const app = createApp();
const server = createServer(app);

server.listen(env.PORT, () => {
  console.log(`Collaborative editor API listening on port ${env.PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received. Closing collaborative editor API.`);

  server.close(async () => {
    await Promise.allSettled([closePostgresPool(), closeRedisClient()]);
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
