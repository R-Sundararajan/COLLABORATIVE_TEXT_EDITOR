const crypto = require("node:crypto");

const { env } = require("../../config/env");

const TOKEN_TYPE = "Bearer";

class AuthTokenError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthTokenError";
  }
}

function signSessionToken(user) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + env.JWT_EXPIRES_IN_SECONDS;

  return signJwt({
    sub: user.id,
    email: user.email,
    displayName: user.displayName,
    iat: issuedAt,
    exp: expiresAt,
  });
}

function verifySessionToken(token) {
  const payload = verifyJwt(token);

  if (!payload.sub || typeof payload.sub !== "string") {
    throw new AuthTokenError("Token subject is missing.");
  }

  return payload;
}

function signJwt(payload) {
  const encodedHeader = encodeJson({
    alg: "HS256",
    typ: "JWT",
  });
  const encodedPayload = encodeJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signHmac(signingInput);

  return `${signingInput}.${signature}`;
}

function verifyJwt(token) {
  if (typeof token !== "string") {
    throw new AuthTokenError("Token is missing.");
  }

  const tokenParts = token.split(".");

  if (tokenParts.length !== 3) {
    throw new AuthTokenError("Token format is invalid.");
  }

  const [encodedHeader, encodedPayload, signature] = tokenParts;
  const header = decodeJson(encodedHeader);

  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new AuthTokenError("Token algorithm is not supported.");
  }

  const expectedSignature = signHmac(`${encodedHeader}.${encodedPayload}`);

  if (!safeCompare(signature, expectedSignature)) {
    throw new AuthTokenError("Token signature is invalid.");
  }

  const payload = decodeJson(encodedPayload);
  const now = Math.floor(Date.now() / 1000);

  if (typeof payload.exp !== "number" || payload.exp <= now) {
    throw new AuthTokenError("Token is expired.");
  }

  return payload;
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch (_error) {
    throw new AuthTokenError("Token payload is invalid.");
  }
}

function signHmac(value) {
  return crypto
    .createHmac("sha256", env.JWT_SECRET)
    .update(value)
    .digest("base64url");
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = {
  TOKEN_TYPE,
  AuthTokenError,
  signSessionToken,
  verifySessionToken,
};
