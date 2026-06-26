const { createClient } = require("redis");

const { env } = require("./env");

let redisClient;

function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({ url: env.REDIS_URL });
    redisClient.on("error", (error) => {
      console.error("Redis client error:", error.message);
    });
  }

  return redisClient;
}

async function connectRedis() {
  const client = getRedisClient();

  if (!client.isOpen) {
    await client.connect();
  }

  return client;
}

async function checkRedis() {
  const client = await connectRedis();
  const pong = await client.ping();

  return pong === "PONG";
}

async function closeRedisClient() {
  if (redisClient?.isOpen) {
    await redisClient.quit();
  }
}

module.exports = {
  getRedisClient,
  connectRedis,
  checkRedis,
  closeRedisClient,
};
