const express = require("express");

const { createAuthRouter } = require("../modules/auth/routes");

function createApiGateway() {
  const router = express.Router();

  router.get("/", (_req, res) => {
    res.json({
      service: "collaborative-text-editor-api",
      version: "1.0.0",
      routes: {
        auth: "/api/auth",
        session: "/api/auth/session",
      },
    });
  });

  router.use("/auth", createAuthRouter());

  router.use((_req, res) => {
    res.status(404).json({
      message: "API route not found.",
    });
  });

  return router;
}

module.exports = {
  createApiGateway,
};
