/**
 * Exercises the authenticated document lifecycle against Express/PostgreSQL.
 * Verifies CRUD, statistics, version changes, revision-aware persistence,
 * stale-write rejection, and soft-archive visibility through public APIs.
 */
const assert = require("node:assert/strict");
const { createServer } = require("node:http");

const { closePostgresPool, pool } = require("../../config/postgres");
const { createApp } = require("../../http/app");
const { runMigrations } = require("../../db/migrate");
const { writeDocumentState } = require("./repository");

async function main() {
  const logger = { log() {} };
  await runMigrations({ logger });

  const server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const testUser = {
    email: `crud-${Date.now()}@example.com`,
    displayName: "CRUD Tester",
    password: "strong-password",
  };
  let userId;

  try {
    const unauthorizedList = await request(baseUrl, "GET", "/api/documents");
    assert.equal(unauthorizedList.status, 401);

    const registerResponse = await request(
      baseUrl,
      "POST",
      "/api/auth/register",
      testUser,
    );
    assert.equal(registerResponse.status, 201);
    assert.ok(registerResponse.body.token);
    userId = registerResponse.body.user.id;

    const headers = {
      Authorization: `Bearer ${registerResponse.body.token}`,
    };

    const createResponse = await request(
      baseUrl,
      "POST",
      "/api/documents",
      {
        title: "CRUD lifecycle",
        content: "First saved draft",
        metadata: { source: "crud-test" },
      },
      headers,
    );
    assert.equal(createResponse.status, 201);
    assert.equal(createResponse.body.document.title, "CRUD lifecycle");
    assert.equal(createResponse.body.document.content, "First saved draft");
    assert.equal(createResponse.body.document.permissionRole, "owner");
    assert.equal(createResponse.body.document.statistics.wordCount, 3);
    const documentId = createResponse.body.document.id;
    const initialVersion = createResponse.body.document.version;

    const listResponse = await request(baseUrl, "GET", "/api/documents", null, headers);
    assert.equal(listResponse.status, 200);
    assert.ok(
      listResponse.body.documents.some((document) => document.id === documentId),
    );

    const readResponse = await request(
      baseUrl,
      "GET",
      `/api/documents/${documentId}`,
      null,
      headers,
    );
    assert.equal(readResponse.status, 200);
    assert.equal(readResponse.body.document.id, documentId);

    const updateResponse = await request(
      baseUrl,
      "PATCH",
      `/api/documents/${documentId}`,
      {
        title: "CRUD lifecycle updated",
        content: "Patched content through update",
        metadata: { source: "crud-test", updated: true },
      },
      headers,
    );
    assert.equal(updateResponse.status, 200);
    assert.equal(updateResponse.body.document.title, "CRUD lifecycle updated");
    assert.equal(updateResponse.body.document.content, "Patched content through update");
    assert.equal(updateResponse.body.document.version, initialVersion + 1);
    assert.equal(updateResponse.body.document.statistics.wordCount, 4);

    const saveResponse = await request(
      baseUrl,
      "PUT",
      `/api/documents/${documentId}/save`,
      {
        content: "Saved editor content with more words",
      },
      headers,
    );
    assert.equal(saveResponse.status, 200);
    assert.equal(saveResponse.body.document.content, "Saved editor content with more words");
    assert.equal(saveResponse.body.document.version, initialVersion + 2);
    assert.equal(saveResponse.body.document.statistics.wordCount, 6);

    const persistedRevision = initialVersion + 5;
    const persistenceResult = await writeDocumentState({
      documentId,
      content: "Recovered collaborative content",
      revision: persistedRevision,
      lastEditedByUserId: userId,
    });
    assert.deepEqual(persistenceResult, {
      status: "updated",
      revision: persistedRevision,
    });

    const stalePersistenceResult = await writeDocumentState({
      documentId,
      content: "stale collaborative content",
      revision: persistedRevision - 1,
      lastEditedByUserId: userId,
    });
    assert.deepEqual(stalePersistenceResult, {
      status: "stale",
      revision: persistedRevision,
    });

    const persistedReadResponse = await request(
      baseUrl,
      "GET",
      `/api/documents/${documentId}`,
      null,
      headers,
    );
    assert.equal(persistedReadResponse.status, 200);
    assert.equal(
      persistedReadResponse.body.document.content,
      "Recovered collaborative content",
    );
    assert.equal(persistedReadResponse.body.document.version, persistedRevision);
    assert.equal(persistedReadResponse.body.document.statistics.wordCount, 3);

    const deleteResponse = await request(
      baseUrl,
      "DELETE",
      `/api/documents/${documentId}`,
      null,
      headers,
    );
    assert.equal(deleteResponse.status, 204);

    const readDeletedResponse = await request(
      baseUrl,
      "GET",
      `/api/documents/${documentId}`,
      null,
      headers,
    );
    assert.equal(readDeletedResponse.status, 404);

    const listAfterDeleteResponse = await request(
      baseUrl,
      "GET",
      "/api/documents",
      null,
      headers,
    );
    assert.equal(listAfterDeleteResponse.status, 200);
    assert.equal(
      listAfterDeleteResponse.body.documents.some(
        (document) => document.id === documentId,
      ),
      false,
    );

    console.log("Document CRUD lifecycle test passed.");
  } finally {
    await closeServer(server);
    if (userId) {
      await cleanupUser(userId);
    }
    await closePostgresPool();
  }
}

async function request(baseUrl, method, path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...headers,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();

  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

function listen(app) {
  const server = createServer(app);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function cleanupUser(userId) {
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      `
        delete from document_metadata
        where document_id in (
          select id
          from documents
          where owner_user_id = $1
        )
      `,
      [userId],
    );
    await client.query(
      `
        delete from document_permissions
        where user_id = $1
          or document_id in (
            select id
            from documents
            where owner_user_id = $1
          )
      `,
      [userId],
    );
    await client.query("delete from documents where owner_user_id = $1", [userId]);
    await client.query("delete from users where id = $1", [userId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
