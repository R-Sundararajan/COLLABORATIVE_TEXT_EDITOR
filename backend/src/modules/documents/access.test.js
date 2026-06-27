/**
 * Exercises sharing, permission, and account-security behavior end to end.
 * Covers email invitations, share-code joins, viewer/editor boundaries,
 * owner-only membership, and password-confirmed profile updates.
 */
const assert = require("node:assert/strict");
const { createServer } = require("node:http");

const { closePostgresPool, pool } = require("../../config/postgres");
const { runMigrations } = require("../../db/migrate");
const { createApp } = require("../../http/app");

async function main() {
  await runMigrations({ logger: { log() {} } });
  const server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = "access-test-password";
  const users = [];

  try {
    const owner = await register(baseUrl, {
      email: `owner-${suffix}@example.com`,
      displayName: "Access Owner",
      password,
    });
    const invited = await register(baseUrl, {
      email: `invited-${suffix}@example.com`,
      displayName: "Invited Viewer",
      password,
    });
    const joiner = await register(baseUrl, {
      email: `joiner-${suffix}@example.com`,
      displayName: "Code Joiner",
      password,
    });
    users.push(owner.user.id, invited.user.id, joiner.user.id);

    const ownerHeaders = authHeaders(owner.token);
    const invitedHeaders = authHeaders(invited.token);
    const joinerHeaders = authHeaders(joiner.token);
    const created = await request(baseUrl, "POST", "/api/documents", {
      title: "Shared access test",
      content: "Owner content",
      metadata: {},
    }, ownerHeaders);
    assert.equal(created.status, 201);
    const documentId = created.body.document.id;

    const directShare = await request(
      baseUrl,
      "POST",
      `/api/documents/${documentId}/share`,
      { email: invited.user.email, role: "viewer" },
      ownerHeaders,
    );
    assert.equal(directShare.status, 200);
    assert.equal(directShare.body.member.role, "viewer");

    const invitedList = await request(
      baseUrl,
      "GET",
      "/api/documents",
      null,
      invitedHeaders,
    );
    assert.equal(invitedList.status, 200);
    assert.equal(invitedList.body.documents[0].permissionRole, "viewer");

    const forbiddenEdit = await request(
      baseUrl,
      "PATCH",
      `/api/documents/${documentId}`,
      { title: "Viewer edit" },
      invitedHeaders,
    );
    assert.equal(forbiddenEdit.status, 403);

    const shareLink = await request(
      baseUrl,
      "POST",
      `/api/documents/${documentId}/share-link`,
      { role: "editor" },
      ownerHeaders,
    );
    assert.equal(shareLink.status, 200);
    assert.match(shareLink.body.shareLink.code, /^[A-F0-9]{12}$/);

    const joined = await request(
      baseUrl,
      "POST",
      "/api/documents/join",
      { code: shareLink.body.shareLink.code },
      joinerHeaders,
    );
    assert.equal(joined.status, 200);
    assert.equal(joined.body.document.permissionRole, "editor");

    const editorUpdate = await request(
      baseUrl,
      "PATCH",
      `/api/documents/${documentId}`,
      { title: "Editor updated title" },
      joinerHeaders,
    );
    assert.equal(editorUpdate.status, 200);

    const members = await request(
      baseUrl,
      "GET",
      `/api/documents/${documentId}/members`,
      null,
      ownerHeaders,
    );
    assert.equal(members.status, 200);
    assert.equal(members.body.members.length, 3);

    const hiddenMembers = await request(
      baseUrl,
      "GET",
      `/api/documents/${documentId}/members`,
      null,
      invitedHeaders,
    );
    assert.equal(hiddenMembers.status, 403);

    const wrongPassword = await request(
      baseUrl,
      "PATCH",
      "/api/auth/me",
      { displayName: "Wrong Password", currentPassword: "not-the-password" },
      joinerHeaders,
    );
    assert.equal(wrongPassword.status, 401);

    const profileUpdate = await request(
      baseUrl,
      "PATCH",
      "/api/auth/me",
      { displayName: "Updated Joiner", currentPassword: password },
      joinerHeaders,
    );
    assert.equal(profileUpdate.status, 200);
    assert.equal(profileUpdate.body.user.displayName, "Updated Joiner");

    console.log("Document sharing and account access test passed.");
  } finally {
    await closeServer(server);
    await cleanupUsers(users);
    await closePostgresPool();
  }
}

async function register(baseUrl, input) {
  const response = await request(baseUrl, "POST", "/api/auth/register", input);
  assert.equal(response.status, 201);
  return response.body;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
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
  return { status: response.status, body: text ? JSON.parse(text) : null };
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
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function cleanupUsers(userIds) {
  if (userIds.length === 0) return;
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      "delete from documents where owner_user_id = any($1::uuid[])",
      [userIds],
    );
    await client.query("delete from users where id = any($1::uuid[])", [userIds]);
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
