const DEFAULT_HISTORY_LIMIT = 1_000;

class OperationError extends Error {
  constructor(code, message, currentRevision) {
    super(message);
    this.name = "OperationError";
    this.code = code;
    this.currentRevision = currentRevision;
  }
}

class DocumentOperationState {
  constructor({
    content = "",
    revision = 0,
    historyLimit = DEFAULT_HISTORY_LIMIT,
  } = {}) {
    if (typeof content !== "string") {
      throw new TypeError("Document content must be a string.");
    }

    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new TypeError("Document revision must be a non-negative integer.");
    }

    if (!Number.isSafeInteger(historyLimit) || historyLimit < 1) {
      throw new TypeError("Operation history limit must be a positive integer.");
    }

    this.content = content;
    this.revision = revision;
    this.historyLimit = historyLimit;
    this.history = [];
    this.acceptedOperations = new Map();
  }

  submit({ userId, clientOperationId, baseRevision, operation }) {
    const operationKey = `${userId}:${clientOperationId}`;
    const previousSubmission = this.acceptedOperations.get(operationKey);

    if (previousSubmission) {
      if (
        previousSubmission.baseRevision !== baseRevision ||
        !operationsEqual(previousSubmission.submittedOperation, operation)
      ) {
        throw new OperationError(
          "OPERATION_ID_REUSED",
          "clientOperationId was already used for a different edit.",
          this.revision,
        );
      }

      return { ...previousSubmission.result, duplicate: true };
    }

    this.assertUsableRevision(baseRevision);

    const newerOperations = this.history.filter(
      (entry) => entry.revision > baseRevision,
    );
    const baseContentLength = newerOperations.reduce(
      (length, entry) => length - operationLengthDelta(entry.operation),
      this.content.length,
    );

    assertOperationFits(operation, baseContentLength, this.revision);

    const transformedOperation = newerOperations.reduce(
      (transformed, entry) => transformOperation(transformed, entry.operation),
      operation,
    );

    assertOperationFits(transformedOperation, this.content.length, this.revision);

    this.content = applyOperation(this.content, transformedOperation);
    this.revision += 1;

    const result = {
      operation: transformedOperation,
      revision: this.revision,
      content: this.content,
      duplicate: false,
    };
    const historyEntry = {
      revision: this.revision,
      operation: transformedOperation,
      operationKey,
    };

    this.history.push(historyEntry);
    this.acceptedOperations.set(operationKey, {
      baseRevision,
      submittedOperation: { ...operation },
      result,
    });
    this.trimHistory();

    return result;
  }

  assertUsableRevision(baseRevision) {
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) {
      throw new OperationError(
        "INVALID_REVISION",
        "baseRevision must be a non-negative integer.",
        this.revision,
      );
    }

    if (baseRevision > this.revision) {
      throw new OperationError(
        "REVISION_AHEAD",
        "The edit is based on a future document revision.",
        this.revision,
      );
    }

    const oldestAvailableRevision =
      this.history.length > 0 ? this.history[0].revision - 1 : this.revision;

    if (baseRevision < oldestAvailableRevision) {
      throw new OperationError(
        "REVISION_TOO_OLD",
        "The edit is too old to transform; rejoin the document to synchronize.",
        this.revision,
      );
    }
  }

  trimHistory() {
    while (this.history.length > this.historyLimit) {
      const removed = this.history.shift();
      this.acceptedOperations.delete(removed.operationKey);
    }
  }
}

function transformOperation(operation, against) {
  if (operation.deleteCount === 0) {
    return {
      ...operation,
      index: transformPosition(operation.index, against, "right"),
    };
  }

  const start = transformPosition(operation.index, against, "right");
  const end = transformPosition(
    operation.index + operation.deleteCount,
    against,
    "left",
  );

  return {
    index: start,
    deleteCount: Math.max(0, end - start),
    insertText: operation.insertText,
  };
}

function transformPosition(position, operation, affinity) {
  const operationStart = operation.index;
  const operationEnd = operation.index + operation.deleteCount;
  const insertedLength = operation.insertText.length;

  if (operation.deleteCount === 0) {
    if (position < operationStart) {
      return position;
    }

    if (position > operationStart || affinity === "right") {
      return position + insertedLength;
    }

    return position;
  }

  if (position < operationStart) {
    return position;
  }

  if (position >= operationEnd) {
    return position + insertedLength - operation.deleteCount;
  }

  return operationStart + (affinity === "right" ? insertedLength : 0);
}

function applyOperation(content, operation) {
  assertOperationFits(operation, content.length);

  return (
    content.slice(0, operation.index) +
    operation.insertText +
    content.slice(operation.index + operation.deleteCount)
  );
}

function assertOperationFits(operation, contentLength, currentRevision) {
  if (
    operation.index > contentLength ||
    operation.deleteCount > contentLength - operation.index
  ) {
    throw new OperationError(
      "OPERATION_OUT_OF_BOUNDS",
      "The edit range is outside the document content.",
      currentRevision,
    );
  }
}

function operationLengthDelta(operation) {
  return operation.insertText.length - operation.deleteCount;
}

function operationsEqual(left, right) {
  return (
    left.index === right.index &&
    left.deleteCount === right.deleteCount &&
    left.insertText === right.insertText
  );
}

module.exports = {
  DocumentOperationState,
  OperationError,
  applyOperation,
  transformOperation,
};
