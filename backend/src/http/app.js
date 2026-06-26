const cors = require("cors");
const express = require("express");

const { env } = require("../config/env");
const { checkPostgres } = require("../config/postgres");
const { checkRedis } = require("../config/redis");
const { createApiGateway } = require("./apiGateway");

function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.json({
      service: "collaborative-text-editor-api",
      status: "ok",
      phase: "authentication-api-gateway",
    });
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.get("/health/dependencies", async (_req, res) => {
    const dependencies = await checkDependencies();
    const isHealthy = Object.values(dependencies).every(
      (dependency) => dependency.status === "ok",
    );

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? "ok" : "degraded",
      dependencies,
    });
  });

  app.use("/api", createApiGateway());

  app.use(handleError);

  return app;
}

async function checkDependencies() {
  const checks = {
    postgres: checkPostgres,
    redis: checkRedis,
  };

  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, check]) => {
      try {
        await check();

        return [name, { status: "ok" }];
      } catch (error) {
        return [
          name,
          {
            status: "error",
            message: error.message,
          },
        ];
      }
    }),
  );

  return Object.fromEntries(entries);
}

function handleError(error, _req, res, _next) {
  const statusCode =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;

  res.status(statusCode).json({
    message:
      statusCode >= 500
        ? "Internal server error."
        : error.message || "Request failed.",
  });
}

module.exports = { createApp };
