const dotenv = require("dotenv");

dotenv.config();

function readPositiveInteger(value, fallback) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

function readJwtSecret(value, nodeEnv) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (nodeEnv === "production") {
    throw new Error("JWT_SECRET must be configured in production.");
  }

  return "development-only-change-this-jwt-secret";
}

const nodeEnv = process.env.NODE_ENV || "development";

const env = {
  NODE_ENV: nodeEnv,
  PORT: readPositiveInteger(process.env.PORT, 5000),
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",
  DATABASE_URL:
    process.env.DATABASE_URL ||
    "postgres://editor:editor_password@localhost:5432/collab_editor",
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  ACTIVE_DOCUMENT_CACHE_TTL_SECONDS: readPositiveInteger(
    process.env.ACTIVE_DOCUMENT_CACHE_TTL_SECONDS,
    24 * 60 * 60,
  ),
  DOCUMENT_PERSIST_DEBOUNCE_MS: readPositiveInteger(
    process.env.DOCUMENT_PERSIST_DEBOUNCE_MS,
    1_000,
  ),
  DOCUMENT_PERSIST_RETRY_MS: readPositiveInteger(
    process.env.DOCUMENT_PERSIST_RETRY_MS,
    5_000,
  ),
  JWT_SECRET: readJwtSecret(process.env.JWT_SECRET, nodeEnv),
  JWT_EXPIRES_IN_SECONDS: readPositiveInteger(
    process.env.JWT_EXPIRES_IN_SECONDS,
    60 * 60,
  ),
};

module.exports = { env };
