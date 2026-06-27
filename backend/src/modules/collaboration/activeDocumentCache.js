const { env } = require("../../config/env");
const { connectRedis } = require("../../config/redis");

const CACHE_SCHEMA_VERSION = 2;
const CACHE_KEY_PREFIX = "collab:active-document:";

class ActiveDocumentCache {
  constructor({
    connect = connectRedis,
    ttlSeconds = env.ACTIVE_DOCUMENT_CACHE_TTL_SECONDS,
  } = {}) {
    if (typeof connect !== "function") {
      throw new TypeError("A Redis connection provider is required.");
    }

    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
      throw new TypeError("Cache TTL must be a positive integer.");
    }

    this.connect = connect;
    this.ttlSeconds = ttlSeconds;
  }

  async get(documentId) {
    assertDocumentId(documentId);

    const client = await this.connect();
    const key = cacheKey(documentId);
    const serialized = await client.getEx(key, { EX: this.ttlSeconds });

    if (serialized === null) {
      return null;
    }

    const state = parseCachedState(serialized, documentId);

    if (!state) {
      await client.del(key);
      return null;
    }

    return state;
  }

  async set(documentId, state) {
    assertDocumentId(documentId);
    assertDocumentState(state);

    const client = await this.connect();
    const cachedState = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      documentId,
      content: state.content,
      revision: state.revision,
      lastEditedByUserId: state.lastEditedByUserId || null,
      cachedAt: new Date().toISOString(),
    };

    await client.set(cacheKey(documentId), JSON.stringify(cachedState), {
      EX: this.ttlSeconds,
    });

    return {
      content: cachedState.content,
      revision: cachedState.revision,
      lastEditedByUserId: cachedState.lastEditedByUserId,
    };
  }

  async delete(documentId) {
    assertDocumentId(documentId);

    const client = await this.connect();
    await client.del(cacheKey(documentId));
  }
}

function cacheKey(documentId) {
  return `${CACHE_KEY_PREFIX}${documentId}`;
}

function parseCachedState(serialized, documentId) {
  let value;

  try {
    value = JSON.parse(serialized);
  } catch {
    return null;
  }

  if (
    !value ||
    value.schemaVersion !== CACHE_SCHEMA_VERSION ||
    value.documentId !== documentId ||
    typeof value.content !== "string" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !(
      value.lastEditedByUserId === null ||
      typeof value.lastEditedByUserId === "string"
    )
  ) {
    return null;
  }

  return {
    content: value.content,
    revision: value.revision,
    lastEditedByUserId: value.lastEditedByUserId,
  };
}

function assertDocumentId(documentId) {
  if (typeof documentId !== "string" || documentId.length === 0) {
    throw new TypeError("Document id must be a non-empty string.");
  }
}

function assertDocumentState(state) {
  if (
    !state ||
    typeof state.content !== "string" ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0 ||
    !(
      typeof state.lastEditedByUserId === "undefined" ||
      state.lastEditedByUserId === null ||
      typeof state.lastEditedByUserId === "string"
    )
  ) {
    throw new TypeError(
      "Cached document state requires string content and a non-negative revision.",
    );
  }
}

const activeDocumentCache = new ActiveDocumentCache();

module.exports = {
  ActiveDocumentCache,
  activeDocumentCache,
};
