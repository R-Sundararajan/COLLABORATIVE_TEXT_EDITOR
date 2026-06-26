class ValidationError extends Error {
  constructor(details) {
    super("Request validation failed.");
    this.name = "ValidationError";
    this.details = details;
  }
}

function parseRegisterRequest(body) {
  const input = normalizeAuthBody(body);
  const errors = validateAuthInput(input, { requireDisplayName: true });

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  return input;
}

function parseLoginRequest(body) {
  const input = normalizeAuthBody(body);
  const errors = validateAuthInput(input, { requireDisplayName: false });

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  return {
    email: input.email,
    password: input.password,
  };
}

function normalizeAuthBody(body) {
  return {
    email: normalizeEmail(body?.email),
    displayName:
      typeof body?.displayName === "string" ? body.displayName.trim() : "",
    password: typeof body?.password === "string" ? body.password : "",
  };
}

function normalizeEmail(email) {
  if (typeof email !== "string") {
    return "";
  }

  return email.trim().toLowerCase();
}

function validateAuthInput(input, { requireDisplayName }) {
  const errors = [];

  if (!isValidEmail(input.email)) {
    errors.push({
      field: "email",
      message: "A valid email address is required.",
    });
  }

  if (requireDisplayName && input.displayName.length < 2) {
    errors.push({
      field: "displayName",
      message: "Display name must be at least 2 characters.",
    });
  }

  if (input.password.length < 8) {
    errors.push({
      field: "password",
      message: "Password must be at least 8 characters.",
    });
  }

  if (input.password.length > 256) {
    errors.push({
      field: "password",
      message: "Password must be 256 characters or fewer.",
    });
  }

  return errors;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = {
  ValidationError,
  parseLoginRequest,
  parseRegisterRequest,
};
