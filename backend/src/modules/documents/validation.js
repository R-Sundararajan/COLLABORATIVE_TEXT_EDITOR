class DocumentValidationError extends Error {
  constructor(details) {
    super("Request validation failed.");
    this.name = "DocumentValidationError";
    this.details = details;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseDocumentId(value) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new DocumentValidationError([
      {
        field: "documentId",
        message: "A valid document id is required.",
      },
    ]);
  }

  return value;
}

function parseCreateDocumentRequest(body) {
  const input = {
    title: normalizeOptionalString(body?.title),
    content: normalizeContent(body?.content, ""),
    metadata: normalizeMetadata(body?.metadata, {}),
  };
  const errors = [];

  validateTitle(input.title, { required: true }, errors);
  validateContent(input.content, errors);
  validateMetadata(input.metadata, errors);

  throwIfInvalid(errors);

  return input;
}

function parseUpdateDocumentRequest(body) {
  const hasTitle = Object.prototype.hasOwnProperty.call(body || {}, "title");
  const hasContent = Object.prototype.hasOwnProperty.call(body || {}, "content");
  const hasMetadata = Object.prototype.hasOwnProperty.call(body || {}, "metadata");
  const input = {};
  const errors = [];

  if (hasTitle) {
    input.title = normalizeOptionalString(body.title);
    validateTitle(input.title, { required: true }, errors);
  }

  if (hasContent) {
    input.content = normalizeContent(body.content);
    validateContent(input.content, errors);
  }

  if (hasMetadata) {
    input.metadata = normalizeMetadata(body.metadata);
    validateMetadata(input.metadata, errors);
  }

  if (!hasTitle && !hasContent && !hasMetadata) {
    errors.push({
      field: "document",
      message: "At least one document field is required.",
    });
  }

  throwIfInvalid(errors);

  return input;
}

function parseSaveDocumentRequest(body) {
  const input = {
    content: normalizeContent(body?.content),
  };
  const errors = [];

  validateContent(input.content, errors);
  throwIfInvalid(errors);

  return input;
}

function normalizeOptionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeContent(value, fallback) {
  if (typeof value === "undefined" && typeof fallback !== "undefined") {
    return fallback;
  }

  return typeof value === "string" ? value : null;
}

function normalizeMetadata(value, fallback) {
  if (typeof value === "undefined" && typeof fallback !== "undefined") {
    return fallback;
  }

  return value;
}

function validateTitle(title, { required }, errors) {
  if (required && title.length === 0) {
    errors.push({
      field: "title",
      message: "Document title is required.",
    });
    return;
  }

  if (title.length > 200) {
    errors.push({
      field: "title",
      message: "Document title must be 200 characters or fewer.",
    });
  }
}

function validateContent(content, errors) {
  if (typeof content !== "string") {
    errors.push({
      field: "content",
      message: "Document content must be a string.",
    });
  }
}

function validateMetadata(metadata, errors) {
  if (!isPlainObject(metadata)) {
    errors.push({
      field: "metadata",
      message: "Document metadata must be an object.",
    });
  }
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function throwIfInvalid(errors) {
  if (errors.length > 0) {
    throw new DocumentValidationError(errors);
  }
}

module.exports = {
  DocumentValidationError,
  parseCreateDocumentRequest,
  parseDocumentId,
  parseSaveDocumentRequest,
  parseUpdateDocumentRequest,
};
