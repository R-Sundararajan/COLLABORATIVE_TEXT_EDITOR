/**
 * Verifies pure splice application and operational-transform state behavior.
 * Covers insert/delete conflicts, deterministic concurrent order, duplicate
 * delivery, operation-ID reuse, invalid ranges/revisions, and history expiry.
 */
const assert = require("node:assert/strict");

const {
  DocumentOperationState,
  OperationError,
  applyOperation,
  transformOperation,
} = require("./operationalTransform");

function main() {
  assert.equal(
    applyOperation("collaborate", {
      index: 6,
      deleteCount: 5,
      insertText: "tion",
    }),
    "collabtion",
  );

  assert.deepEqual(
    transformOperation(
      { index: 1, deleteCount: 0, insertText: "B" },
      { index: 1, deleteCount: 0, insertText: "A" },
    ),
    { index: 2, deleteCount: 0, insertText: "B" },
  );

  assert.deepEqual(
    transformOperation(
      { index: 1, deleteCount: 4, insertText: "" },
      { index: 3, deleteCount: 0, insertText: "new" },
    ),
    { index: 1, deleteCount: 7, insertText: "" },
  );

  const state = new DocumentOperationState({ content: "ab", revision: 7 });
  const first = state.submit({
    userId: "first-user",
    clientOperationId: "first-operation",
    baseRevision: 7,
    operation: { index: 1, deleteCount: 0, insertText: "X" },
  });
  const second = state.submit({
    userId: "second-user",
    clientOperationId: "second-operation",
    baseRevision: 7,
    operation: { index: 1, deleteCount: 0, insertText: "Y" },
  });

  assert.equal(first.revision, 8);
  assert.deepEqual(second.operation, {
    index: 2,
    deleteCount: 0,
    insertText: "Y",
  });
  assert.equal(second.revision, 9);
  assert.equal(state.content, "aXYb");

  const duplicate = state.submit({
    userId: "second-user",
    clientOperationId: "second-operation",
    baseRevision: 7,
    operation: { index: 1, deleteCount: 0, insertText: "Y" },
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.revision, 9);
  assert.equal(state.revision, 9);

  assertOperationError(
    () =>
      state.submit({
        userId: "second-user",
        clientOperationId: "second-operation",
        baseRevision: 7,
        operation: { index: 1, deleteCount: 0, insertText: "different" },
      }),
    "OPERATION_ID_REUSED",
    9,
  );

  assertOperationError(
    () =>
      state.submit({
        userId: "first-user",
        clientOperationId: "future-operation",
        baseRevision: 10,
        operation: { index: 0, deleteCount: 0, insertText: "future" },
      }),
    "REVISION_AHEAD",
    9,
  );

  assertOperationError(
    () =>
      state.submit({
        userId: "first-user",
        clientOperationId: "invalid-range",
        baseRevision: 9,
        operation: { index: 20, deleteCount: 0, insertText: "invalid" },
      }),
    "OPERATION_OUT_OF_BOUNDS",
    9,
  );

  const boundedState = new DocumentOperationState({
    content: "",
    revision: 0,
    historyLimit: 2,
  });

  for (let index = 0; index < 3; index += 1) {
    boundedState.submit({
      userId: "writer",
      clientOperationId: `operation-${index}`,
      baseRevision: index,
      operation: { index, deleteCount: 0, insertText: String(index) },
    });
  }

  assertOperationError(
    () =>
      boundedState.submit({
        userId: "stale-writer",
        clientOperationId: "stale-operation",
        baseRevision: 0,
        operation: { index: 0, deleteCount: 0, insertText: "stale" },
      }),
    "REVISION_TOO_OLD",
    3,
  );

  console.log("Operational transform tests passed.");
}

function assertOperationError(callback, expectedCode, expectedRevision) {
  assert.throws(callback, (error) => {
    assert.equal(error instanceof OperationError, true);
    assert.equal(error.code, expectedCode);
    assert.equal(error.currentRevision, expectedRevision);
    return true;
  });
}

main();
