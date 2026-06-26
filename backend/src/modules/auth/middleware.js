const { AuthTokenError, verifySessionToken } = require("./tokens");
const { findUserById } = require("./repository");

async function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({
        message: "Authentication is required.",
      });
    }

    const tokenPayload = verifySessionToken(token);
    const user = await findUserById(tokenPayload.sub);

    if (!user) {
      return res.status(401).json({
        message: "Authentication is required.",
      });
    }

    req.auth = {
      tokenPayload,
      user,
    };

    return next();
  } catch (error) {
    if (error instanceof AuthTokenError) {
      return res.status(401).json({
        message: "Authentication is required.",
      });
    }

    return next(error);
  }
}

function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

module.exports = {
  extractBearerToken,
  requireAuth,
};
