const MAX_INSERT_TEXT_LENGTH = 50_000;
const MAX_CLIENT_OPERATION_ID_LENGTH = 128;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class CollaborationProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CollaborationProtocolError";
    this.code = code;
  }
}

function parseClientMessage(data, isBinary) {
  if (isBinary) {
    throw new CollaborationProtocolError(
      "INVALID_MESSAGE",
      "Binary messages are not supported.",
    );
  }

  let message;

  try {
    message = JSON.parse(data.toString("utf8"));
  } catch (_error) {
    throw new CollaborationProtocolError(
      "INVALID_MESSAGE",
      "Message must contain valid JSON.",
    );
  }

  if (!isObject(message) || typeof message.type !== "string") {
    throw new CollaborationProtocolError(
      "INVALID_MESSAGE",
      "Message type is required.",
    );
  }

  switch (message.type) {
    case "authenticate":
      return parseAuthenticateMessage(message);
    case "join_document":
    case "leave_document":
      return {
        type: message.type,
        documentId: parseDocumentId(message.documentId),
      };
    case "edit":
      return parseEditMessage(message);
    default:
      throw new CollaborationProtocolError(
        "UNKNOWN_MESSAGE_TYPE",
        `Unsupported message type: ${message.type}.`,
      );
  }
}

function parseAuthenticateMessage(message) {
  if (typeof message.token !== "string" || message.token.length === 0) {
    throw new CollaborationProtocolError(
      "INVALID_MESSAGE",
      "Authentication token is required.",
    );
  }

  return {
    type: "authenticate",
    token: message.token,
  };
}

function parseEditMessage(message) {
  const documentId = parseDocumentId(message.documentId);
  const clientOperationId = parseClientOperationId(message.clientOperationId);
  const baseRevision = message.baseRevision;
  const operation = message.operation;

  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) {
    throw new CollaborationProtocolError(
      "INVALID_REVISION",
      "baseRevision must be a non-negative integer.",
    );
  }

  if (!isObject(operation)) {
    throw new CollaborationProtocolError(
      "INVALID_OPERATION",
      "Edit operation is required.",
    );
  }

  if (!Number.isSafeInteger(operation.index) || operation.index < 0) {
    throw new CollaborationProtocolError(
      "INVALID_OPERATION",
      "Operation index must be a non-negative integer.",
    );
  }

  if (!Number.isSafeInteger(operation.deleteCount) || operation.deleteCount < 0) {
    throw new CollaborationProtocolError(
      "INVALID_OPERATION",
      "Operation deleteCount must be a non-negative integer.",
    );
  }

  if (
    typeof operation.insertText !== "string" ||
    operation.insertText.length > MAX_INSERT_TEXT_LENGTH
  ) {
    throw new CollaborationProtocolError(
      "INVALID_OPERATION",
      `Operation insertText must be at most ${MAX_INSERT_TEXT_LENGTH} characters.`,
    );
  }

  if (operation.deleteCount === 0 && operation.insertText.length === 0) {
    throw new CollaborationProtocolError(
      "INVALID_OPERATION",
      "Operation must insert or delete content.",
    );
  }

  return {
    type: "edit",
    documentId,
    clientOperationId,
    baseRevision,
    operation: {
      index: operation.index,
      deleteCount: operation.deleteCount,
      insertText: operation.insertText,
    },
  };
}

function parseDocumentId(documentId) {
  if (typeof documentId !== "string" || !UUID_PATTERN.test(documentId)) {
    throw new CollaborationProtocolError(
      "INVALID_DOCUMENT_ID",
      "Document id must be a valid UUID.",
    );
  }

  return documentId.toLowerCase();
}

function parseClientOperationId(clientOperationId) {
  if (
    typeof clientOperationId !== "string" ||
    clientOperationId.length === 0 ||
    clientOperationId.length > MAX_CLIENT_OPERATION_ID_LENGTH
  ) {
    throw new CollaborationProtocolError(
      "INVALID_OPERATION",
      `clientOperationId must be between 1 and ${MAX_CLIENT_OPERATION_ID_LENGTH} characters.`,
    );
  }

  return clientOperationId;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  CollaborationProtocolError,
  parseClientMessage,
};
