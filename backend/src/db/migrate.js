/**
 * Discovers ordered SQL migrations and verifies their SHA-256 checksums.
 * Applies each new migration transactionally with its schema_migrations row
 * and exports the runner for the CLI and database-backed tests.
 */
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const { closePostgresPool, pool } = require("../config/postgres");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const MIGRATION_FILE_PATTERN = /^(\d{3,})_[a-z0-9_]+\.sql$/;

async function loadMigrations(migrationsDir = MIGRATIONS_DIR) {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const migrations = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map(async (entry) => {
        const match = entry.name.match(MIGRATION_FILE_PATTERN);

        if (!match) {
          throw new Error(
            `Migration "${entry.name}" must match 001_descriptive_name.sql`,
          );
        }

        const filePath = path.join(migrationsDir, entry.name);
        const sql = await fs.readFile(filePath, "utf8");

        return {
          id: Number(match[1]),
          name: entry.name,
          path: filePath,
          checksum: crypto.createHash("sha256").update(sql).digest("hex"),
          sql,
        };
      }),
  );

  migrations.sort((left, right) => left.id - right.id);
  assertUniqueMigrations(migrations);

  return migrations;
}

async function runMigrations({ logger = console } = {}) {
  const migrations = await loadMigrations();
  const client = await pool.connect();
  let appliedCount = 0;
  let skippedCount = 0;

  try {
    await ensureMigrationsTable(client);
    const appliedMigrations = await getAppliedMigrations(client);

    for (const migration of migrations) {
      const appliedById = appliedMigrations.byId.get(migration.id);
      const appliedByName = appliedMigrations.byName.get(migration.name);

      if (appliedById || appliedByName) {
        // ID, name, and checksum are a single immutable migration identity.
        assertMigrationMatchesApplied(migration, appliedById, appliedByName);
        skippedCount += 1;
        logger?.log(`Skipping applied migration ${migration.name}`);
        continue;
      }

      logger?.log(`Applying migration ${migration.name}`);
      await applyMigration(client, migration);
      appliedCount += 1;
    }
  } finally {
    client.release();
  }

  return {
    appliedCount,
    skippedCount,
    migrationCount: migrations.length,
  };
}

function assertUniqueMigrations(migrations) {
  const ids = new Set();
  const names = new Set();

  for (const migration of migrations) {
    if (ids.has(migration.id)) {
      throw new Error(`Duplicate migration id ${migration.id}`);
    }

    if (names.has(migration.name)) {
      throw new Error(`Duplicate migration name ${migration.name}`);
    }

    ids.add(migration.id);
    names.add(migration.name);
  }
}

function assertMigrationMatchesApplied(migration, appliedById, appliedByName) {
  const appliedMigration = appliedById || appliedByName;

  if (appliedById && appliedById.name !== migration.name) {
    throw new Error(
      `Migration id ${migration.id} was already applied as ${appliedById.name}`,
    );
  }

  if (appliedByName && appliedByName.id !== migration.id) {
    throw new Error(
      `Migration ${migration.name} was already applied with id ${appliedByName.id}`,
    );
  }

  if (appliedMigration.checksum !== migration.checksum) {
    throw new Error(
      `Migration ${migration.name} has changed since it was applied`,
    );
  }
}

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      id integer primary key,
      name text not null unique,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
  `);
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query(
    "select id, name, checksum from schema_migrations order by id",
  );

  return {
    byId: new Map(rows.map((row) => [row.id, row])),
    byName: new Map(rows.map((row) => [row.name, row])),
  };
}

async function applyMigration(client, migration) {
  await client.query("begin");

  try {
    await client.query(migration.sql);
    await client.query(
      `
        insert into schema_migrations (id, name, checksum)
        values ($1, $2, $3)
      `,
      [migration.id, migration.name, migration.checksum],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function main() {
  try {
    const result = await runMigrations();
    console.log(
      `Migrations complete: ${result.appliedCount} applied, ${result.skippedCount} skipped.`,
    );
  } catch (error) {
    console.error(formatErrorMessage(error));
    process.exitCode = 1;
  } finally {
    await closePostgresPool();
  }
}

function formatErrorMessage(error) {
  if (error?.message?.trim()) {
    return error.message;
  }

  if (error?.code) {
    return `${error.name || "Error"} ${error.code}`;
  }

  return String(error);
}

if (require.main === module) {
  main();
}

module.exports = {
  MIGRATIONS_DIR,
  loadMigrations,
  runMigrations,
};
