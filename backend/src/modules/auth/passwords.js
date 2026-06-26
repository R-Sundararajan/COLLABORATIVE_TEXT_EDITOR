const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);

const KEY_LENGTH = 64;
const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
};

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const key = await scrypt(password, salt, KEY_LENGTH, SCRYPT_PARAMS);

  return [
    "scrypt",
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt,
    key.toString("base64url"),
  ].join("$");
}

async function verifyPassword(password, passwordHash) {
  const parsedHash = parsePasswordHash(passwordHash);

  if (!parsedHash) {
    return false;
  }

  const key = await scrypt(password, parsedHash.salt, parsedHash.key.length, {
    N: parsedHash.N,
    r: parsedHash.r,
    p: parsedHash.p,
  });

  return crypto.timingSafeEqual(key, parsedHash.key);
}

function parsePasswordHash(passwordHash) {
  if (typeof passwordHash !== "string") {
    return null;
  }

  const [scheme, cost, blockSize, parallelization, salt, encodedKey] =
    passwordHash.split("$");

  if (scheme !== "scrypt" || !cost || !blockSize || !parallelization) {
    return null;
  }

  try {
    const parsedHash = {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization),
      salt,
      key: Buffer.from(encodedKey, "base64url"),
    };

    if (
      !Number.isInteger(parsedHash.N) ||
      !Number.isInteger(parsedHash.r) ||
      !Number.isInteger(parsedHash.p) ||
      parsedHash.N <= 0 ||
      parsedHash.r <= 0 ||
      parsedHash.p <= 0 ||
      parsedHash.key.length === 0
    ) {
      return null;
    }

    return parsedHash;
  } catch (_error) {
    return null;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
};
