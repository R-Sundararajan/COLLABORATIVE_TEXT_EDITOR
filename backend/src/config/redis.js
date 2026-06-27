const { createClient } = require("redis");

const { env } = require("./env");

let redisClient;
let redisConnectionPromise;

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

  if (!client.isReady) {
    if (!redisConnectionPromise) {
      redisConnectionPromise = client.connect().finally(() => {
        redisConnectionPromise = undefined;
      });
    }

    await redisConnectionPromise;
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

  redisConnectionPromise = undefined;
}

module.exports = {
  getRedisClient,
  connectRedis,
  checkRedis,
  closeRedisClient,
};
