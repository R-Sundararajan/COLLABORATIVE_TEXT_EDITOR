const dotenv = require("dotenv");

dotenv.config();

function readPort(value) {
  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0) {
    return 5000;
  }

  return port;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: readPort(process.env.PORT),
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",
  DATABASE_URL:
    process.env.DATABASE_URL ||
    "postgres://editor:editor_password@localhost:5432/collab_editor",
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
};

module.exports = { env };
