/**
 * Boots the combined Express and WebSocket server process.
 * Coordinates collaboration shutdown before closing the HTTP listener,
 * PostgreSQL pool, and Redis client on termination signals.
 */
const { createServer } = require("node:http");

const { createApp } = require("./src/http/app");
const { env } = require("./src/config/env");
const { closePostgresPool } = require("./src/config/postgres");
const { closeRedisClient } = require("./src/config/redis");
const {
  attachCollaborationServer,
} = require("./src/modules/collaboration/server");

const app = createApp();
const server = createServer(app);
const collaborationServer = attachCollaborationServer(server);

server.listen(env.PORT, () => {
  console.log(`Collaborative editor API listening on port ${env.PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received. Closing collaborative editor API.`);

  await collaborationServer.close();

  server.close(async () => {
    await Promise.allSettled([closePostgresPool(), closeRedisClient()]);
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
