const assert = require("node:assert/strict");

const { ActiveDocumentCache } = require("./activeDocumentCache");

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";

async function main() {
  const redis = new FakeRedisClient();
  let connectionCount = 0;
  const cache = new ActiveDocumentCache({
    connect: async () => {
      connectionCount += 1;
      return redis;
    },
    ttlSeconds: 60,
  });

  assert.equal(await cache.get(DOCUMENT_ID), null);
  assert.deepEqual(redis.lastGetOptions, { EX: 60 });

  await cache.set(DOCUMENT_ID, { content: "cached draft", revision: 4 });
  assert.deepEqual(redis.lastSetOptions, { EX: 60 });
  assert.deepEqual(await cache.get(DOCUMENT_ID), {
    content: "cached draft",
    revision: 4,
    lastEditedByUserId: null,
  });

  await cache.set(DOCUMENT_ID, {
    content: "edited draft",
    revision: 5,
    lastEditedByUserId: "editor-user-id",
  });
  assert.deepEqual(await cache.get(DOCUMENT_ID), {
    content: "edited draft",
    revision: 5,
    lastEditedByUserId: "editor-user-id",
  });

  redis.values.set(redis.lastKey, "not-json");
  assert.equal(await cache.get(DOCUMENT_ID), null);
  assert.equal(redis.values.has(redis.lastKey), false);

  await cache.set(DOCUMENT_ID, { content: "delete me", revision: 5 });
  await cache.delete(DOCUMENT_ID);
  assert.equal(await cache.get(DOCUMENT_ID), null);

  await assert.rejects(
    cache.set(DOCUMENT_ID, { content: "invalid", revision: -1 }),
    TypeError,
  );
  assert.equal(connectionCount, 9);

  console.log("Active document cache test passed.");
}

class FakeRedisClient {
  constructor() {
    this.values = new Map();
    this.lastGetOptions = null;
    this.lastSetOptions = null;
    this.lastKey = null;
  }

  async getEx(key, options) {
    this.lastKey = key;
    this.lastGetOptions = options;
    return this.values.has(key) ? this.values.get(key) : null;
  }

  async set(key, value, options) {
    this.lastKey = key;
    this.lastSetOptions = options;
    this.values.set(key, value);
  }

  async del(key) {
    this.lastKey = key;
    this.values.delete(key);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
