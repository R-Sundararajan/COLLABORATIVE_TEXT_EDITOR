/**
 * Verifies the in-process document persistence coordinator in isolation.
 * Covers latest-revision coalescing, independent documents, retry after a
 * temporary failure, orderly shutdown flush, and closed-state rejection.
 */
const assert = require("node:assert/strict");

const { DocumentStatePersistence } = require("./statePersistence");

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";

async function main() {
  await testCoalescedAndIndependentFlushes();
  await testRetryAfterTemporaryFailure();
  await testShutdownFlush();

  console.log("Document state persistence test passed.");
}

async function testCoalescedAndIndependentFlushes() {
  const writes = [];
  const persistence = new DocumentStatePersistence({
    persist: async (state) => {
      writes.push({ ...state });
      return { status: "updated", revision: state.revision };
    },
    debounceMs: 10_000,
    retryMs: 10_000,
    logger: silentLogger,
  });

  persistence.schedule(createState(DOCUMENT_ID, "first", 1, "first-user"));
  persistence.schedule(createState(DOCUMENT_ID, "latest", 2, "latest-user"));
  persistence.schedule(createState(DOCUMENT_ID, "stale", 1, "stale-user"));
  persistence.schedule(createState(OTHER_DOCUMENT_ID, "other", 7, null));

  const result = await persistence.flush(DOCUMENT_ID);

  assert.deepEqual(result, { status: "updated", revision: 2 });
  assert.deepEqual(writes, [
    createState(DOCUMENT_ID, "latest", 2, "latest-user"),
  ]);

  await persistence.flushAll();
  assert.deepEqual(writes, [
    createState(DOCUMENT_ID, "latest", 2, "latest-user"),
    createState(OTHER_DOCUMENT_ID, "other", 7, null),
  ]);

  await persistence.close();
}

async function testRetryAfterTemporaryFailure() {
  const writes = [];
  let attempt = 0;
  const persistence = new DocumentStatePersistence({
    persist: async (state) => {
      attempt += 1;
      writes.push({ ...state });

      if (attempt === 1) {
        throw new Error("temporary database failure");
      }

      return { status: "updated", revision: state.revision };
    },
    debounceMs: 5,
    retryMs: 5,
    logger: silentLogger,
  });

  persistence.schedule(createState(DOCUMENT_ID, "recoverable", 3, "editor"));
  await waitFor(() => attempt === 2);

  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], writes[1]);

  await persistence.close();
}

async function testShutdownFlush() {
  const writes = [];
  const persistence = new DocumentStatePersistence({
    persist: async (state) => {
      writes.push({ ...state });
      return { status: "updated", revision: state.revision };
    },
    debounceMs: 10_000,
    retryMs: 10_000,
    logger: silentLogger,
  });

  persistence.schedule(createState(DOCUMENT_ID, "shutdown", 9, "editor"));
  const results = await persistence.close();

  assert.equal(results.length, 1);
  assert.equal(results[0].status, "fulfilled");
  assert.deepEqual(writes, [
    createState(DOCUMENT_ID, "shutdown", 9, "editor"),
  ]);
  assert.throws(
    () => persistence.schedule(createState(DOCUMENT_ID, "closed", 10, "editor")),
    /closed/,
  );
}

function createState(documentId, content, revision, lastEditedByUserId) {
  return {
    documentId,
    content,
    revision,
    lastEditedByUserId,
  };
}

async function waitFor(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;

  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for persistence retry.");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const silentLogger = {
  error() {},
  warn() {},
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
