const { pool } = require("../../config/postgres");

class DuplicateEmailError extends Error {
  constructor(email) {
    super(`An account already exists for ${email}.`);
    this.name = "DuplicateEmailError";
  }
}

async function createUser({ email, displayName, passwordHash }) {
  try {
    const { rows } = await pool.query(
      `
        insert into users (email, display_name, password_hash)
        values ($1, $2, $3)
        returning id, email::text, display_name, created_at, updated_at
      `,
      [email, displayName, passwordHash],
    );

    return mapUser(rows[0]);
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      throw new DuplicateEmailError(email);
    }

    throw error;
  }
}

async function findUserByEmail(email) {
  const { rows } = await pool.query(
    `
      select id, email::text, display_name, password_hash, created_at, updated_at
      from users
      where email = $1
        and deleted_at is null
      limit 1
    `,
    [email],
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    ...mapUser(rows[0]),
    passwordHash: rows[0].password_hash,
  };
}

async function findUserById(userId) {
  const { rows } = await pool.query(
    `
      select id, email::text, display_name, created_at, updated_at
      from users
      where id = $1
        and deleted_at is null
      limit 1
    `,
    [userId],
  );

  if (rows.length === 0) {
    return null;
  }

  return mapUser(rows[0]);
}

async function findUserWithPasswordById(userId) {
  const { rows } = await pool.query(
    `
      select id, email::text, display_name, password_hash, created_at, updated_at
      from users
      where id = $1
        and deleted_at is null
      limit 1
    `,
    [userId],
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    ...mapUser(rows[0]),
    passwordHash: rows[0].password_hash,
  };
}

async function updateUser({ userId, email, displayName, passwordHash }) {
  const assignments = [];
  const values = [userId];

  if (typeof email === "string") {
    values.push(email);
    assignments.push(`email = $${values.length}`);
  }

  if (typeof displayName === "string") {
    values.push(displayName);
    assignments.push(`display_name = $${values.length}`);
  }

  if (typeof passwordHash === "string") {
    values.push(passwordHash);
    assignments.push(`password_hash = $${values.length}`);
  }

  try {
    const { rows } = await pool.query(
      `
        update users
        set ${assignments.join(", ")}
        where id = $1
          and deleted_at is null
        returning id, email::text, display_name, created_at, updated_at
      `,
      values,
    );

    return rows.length > 0 ? mapUser(rows[0]) : null;
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      throw new DuplicateEmailError(email);
    }

    throw error;
  }
}

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isDuplicateEmailError(error) {
  return error?.code === "23505" && error?.constraint === "users_email_active_idx";
}

module.exports = {
  DuplicateEmailError,
  createUser,
  findUserByEmail,
  findUserById,
  findUserWithPasswordById,
  updateUser,
};
