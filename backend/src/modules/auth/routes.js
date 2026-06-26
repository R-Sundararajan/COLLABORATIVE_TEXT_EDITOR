const express = require("express");

const { env } = require("../../config/env");
const { hashPassword, verifyPassword } = require("./passwords");
const {
  DuplicateEmailError,
  createUser,
  findUserByEmail,
} = require("./repository");
const { requireAuth } = require("./middleware");
const { TOKEN_TYPE, signSessionToken } = require("./tokens");
const {
  ValidationError,
  parseLoginRequest,
  parseRegisterRequest,
} = require("./validation");

function createAuthRouter() {
  const router = express.Router();

  router.post(
    "/register",
    asyncHandler(async (req, res) => {
      const input = parseRegisterRequest(req.body);
      const passwordHash = await hashPassword(input.password);
      const user = await createUser({
        email: input.email,
        displayName: input.displayName,
        passwordHash,
      });

      res.status(201).json(createSessionResponse(user));
    }),
  );

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const input = parseLoginRequest(req.body);
      const user = await findUserByEmail(input.email);

      if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
        return res.status(401).json({
          message: "Invalid email or password.",
        });
      }

      return res.json(createSessionResponse(user));
    }),
  );

  router.get("/session", requireAuth, (req, res) => {
    res.json({
      authenticated: true,
      user: req.auth.user,
    });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({
      user: req.auth.user,
    });
  });

  router.use(handleAuthError);

  return router;
}

function createSessionResponse(user) {
  return {
    token: signSessionToken(user),
    tokenType: TOKEN_TYPE,
    expiresInSeconds: env.JWT_EXPIRES_IN_SECONDS,
    user,
  };
}

function asyncHandler(routeHandler) {
  return (req, res, next) => {
    Promise.resolve(routeHandler(req, res, next)).catch(next);
  };
}

function handleAuthError(error, _req, res, next) {
  if (error instanceof ValidationError) {
    return res.status(400).json({
      message: error.message,
      details: error.details,
    });
  }

  if (error instanceof DuplicateEmailError) {
    return res.status(409).json({
      message: "An account already exists for that email address.",
    });
  }

  return next(error);
}

module.exports = {
  createAuthRouter,
};
