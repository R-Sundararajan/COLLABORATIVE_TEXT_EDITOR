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

function parseJoinDocumentRequest(body) {
  const code =
    typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";

  if (!/^[A-F0-9]{12}$/.test(code)) {
    throw new DocumentValidationError([
      {
        field: "code",
        message: "Enter a valid 12-character share code.",
      },
    ]);
  }

  return { code };
}

function parseShareDocumentRequest(body) {
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = parseShareRole(body?.role);
  const errors = [];

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({ field: "email", message: "A valid email address is required." });
  }

  if (!role) {
    errors.push({ field: "role", message: "Role must be editor or viewer." });
  }

  throwIfInvalid(errors);
  return { email, role };
}

function parseCreateShareLinkRequest(body) {
  const role = parseShareRole(body?.role);

  if (!role) {
    throw new DocumentValidationError([
      { field: "role", message: "Role must be editor or viewer." },
    ]);
  }

  return { role };
}

function parseShareRole(value) {
  return value === "editor" || value === "viewer" ? value : null;
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
  parseCreateShareLinkRequest,
  parseDocumentId,
  parseJoinDocumentRequest,
  parseSaveDocumentRequest,
  parseShareDocumentRequest,
  parseUpdateDocumentRequest,
};
