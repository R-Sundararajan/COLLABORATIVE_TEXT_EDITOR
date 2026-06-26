const { Pool } = require("pg");

const { env } = require("./env");

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

async function checkPostgres() {
  const client = await pool.connect();

  try {
    await client.query("select 1");
    return true;
  } finally {
    client.release();
  }
}

async function closePostgresPool() {
  await pool.end();
}

module.exports = {
  pool,
  checkPostgres,
  closePostgresPool,
};
