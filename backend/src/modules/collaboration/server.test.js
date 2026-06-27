const assert = require("node:assert/strict");
const { createServer } = require("node:http");

const { WebSocket } = require("ws");

const { attachCollaborationServer } = require("./server");

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";

async function main() {
  const usersByToken = new Map([
    ["owner-token", createUser("owner", "Owner")],
    ["editor-token", createUser("editor", "Editor")],
    ["viewer-token", createUser("viewer", "Viewer")],
  ]);
  const rolesByUserId = new Map([
    ["owner", "owner"],
    ["editor", "editor"],
    ["viewer", "viewer"],
  ]);
  const httpServer = createServer((_req, res) => {
    res.writeHead(404).end();
  });
  const collaborationServer = attachCollaborationServer(httpServer, {
    authenticateToken: async (token) => usersByToken.get(token) || null,
    loadDocumentForUser: async (documentId, userId) => {
      if (documentId !== DOCUMENT_ID) {
        return null;
      }

      return {
        id: documentId,
        permissionRole: rolesByUserId.get(userId),
        content: "0123456789",
        version: 3,
      };
    },
    logger: { error() {}, warn() {} },
  });
  const sockets = [];

  await listen(httpServer);
  const url = `ws://127.0.0.1:${httpServer.address().port}/ws`;

  try {
    const owner = await connect(url);
    const editor = await connect(url);
    const viewer = await connect(url);
    sockets.push(owner, editor, viewer);

    await authenticate(owner, "owner-token", "owner");
    await authenticate(editor, "editor-token", "editor");
    await authenticate(viewer, "viewer-token", "viewer");

    const ownerJoined = waitForMessage(
      owner,
      (message) => message.type === "document_joined",
    );
    owner.send(JSON.stringify({ type: "join_document", documentId: DOCUMENT_ID }));
    assert.deepEqual(await ownerJoined, {
      type: "document_joined",
      documentId: DOCUMENT_ID,
      permissionRole: "owner",
      participantCount: 1,
      content: "0123456789",
      revision: 3,
    });

    const ownerPresence = waitForMessage(
      owner,
      (message) => message.type === "presence" && message.participantCount === 2,
    );
    const editorJoined = waitForMessage(
      editor,
      (message) => message.type === "document_joined",
    );
    editor.send(JSON.stringify({ type: "join_document", documentId: DOCUMENT_ID }));
    assert.equal((await editorJoined).participantCount, 2);
    assert.equal((await ownerPresence).participantCount, 2);

    const operation = { index: 4, deleteCount: 2, insertText: "shared" };
    const ownerReceivedEdit = waitForMessage(
      owner,
      (message) => message.type === "edit",
    );
    const editorAccepted = waitForMessage(
      editor,
      (message) => message.type === "edit_accepted",
    );
    editor.send(
      JSON.stringify({
        type: "edit",
        documentId: DOCUMENT_ID,
        clientOperationId: "operation-1",
        baseRevision: 3,
        operation,
      }),
    );
    const acceptedMessage = await editorAccepted;
    const editMessage = await ownerReceivedEdit;
    assert.equal(acceptedMessage.clientOperationId, "operation-1");
    assert.equal(acceptedMessage.revision, 4);
    assert.deepEqual(editMessage.operation, operation);
    assert.equal(editMessage.revision, 4);
    assert.equal(editMessage.user.id, "editor");

    const editorReceivedFirstConcurrentEdit = waitForMessage(
      editor,
      (message) =>
        message.type === "edit" &&
        message.clientOperationId === "owner-concurrent",
    );
    const ownerConcurrentAccepted = waitForMessage(
      owner,
      (message) =>
        message.type === "edit_accepted" &&
        message.clientOperationId === "owner-concurrent",
    );
    owner.send(
      JSON.stringify({
        type: "edit",
        documentId: DOCUMENT_ID,
        clientOperationId: "owner-concurrent",
        baseRevision: 4,
        operation: { index: 0, deleteCount: 0, insertText: "A" },
      }),
    );
    assert.equal((await ownerConcurrentAccepted).revision, 5);
    await editorReceivedFirstConcurrentEdit;

    const ownerReceivedTransformedEdit = waitForMessage(
      owner,
      (message) =>
        message.type === "edit" &&
        message.clientOperationId === "editor-concurrent",
    );
    const editorConcurrentAccepted = waitForMessage(
      editor,
      (message) =>
        message.type === "edit_accepted" &&
        message.clientOperationId === "editor-concurrent",
    );
    editor.send(
      JSON.stringify({
        type: "edit",
        documentId: DOCUMENT_ID,
        clientOperationId: "editor-concurrent",
        baseRevision: 4,
        operation: { index: 0, deleteCount: 0, insertText: "B" },
      }),
    );
    const transformedAccepted = await editorConcurrentAccepted;
    const transformedBroadcast = await ownerReceivedTransformedEdit;
    assert.deepEqual(transformedAccepted.operation, {
      index: 1,
      deleteCount: 0,
      insertText: "B",
    });
    assert.equal(transformedAccepted.revision, 6);
    assert.deepEqual(
      transformedBroadcast.operation,
      transformedAccepted.operation,
    );
    assert.equal(transformedBroadcast.revision, 6);
    assert.equal(
      collaborationServer.roomManager.getOperationState(DOCUMENT_ID).content,
      "AB0123shared6789",
    );

    const viewerJoined = waitForMessage(
      viewer,
      (message) => message.type === "document_joined",
    );
    viewer.send(JSON.stringify({ type: "join_document", documentId: DOCUMENT_ID }));
    assert.equal((await viewerJoined).permissionRole, "viewer");

    const viewerForbidden = waitForMessage(
      viewer,
      (message) => message.type === "error" && message.code === "EDIT_FORBIDDEN",
    );
    viewer.send(
      JSON.stringify({
        type: "edit",
        documentId: DOCUMENT_ID,
        clientOperationId: "viewer-operation",
        baseRevision: 6,
        operation: { index: 0, deleteCount: 0, insertText: "nope" },
      }),
    );
    assert.equal((await viewerForbidden).documentId, DOCUMENT_ID);

    const missingDocument = waitForMessage(
      owner,
      (message) => message.type === "error" && message.code === "DOCUMENT_NOT_FOUND",
    );
    owner.send(
      JSON.stringify({ type: "join_document", documentId: OTHER_DOCUMENT_ID }),
    );
    assert.equal((await missingDocument).documentId, OTHER_DOCUMENT_ID);

    const viewerLeft = waitForMessage(
      viewer,
      (message) => message.type === "document_left",
    );
    const remainingPresence = waitForMessage(
      owner,
      (message) => message.type === "presence" && message.participantCount === 2,
    );
    viewer.send(JSON.stringify({ type: "leave_document", documentId: DOCUMENT_ID }));
    await viewerLeft;
    assert.equal((await remainingPresence).participantCount, 2);

    console.log("WebSocket collaboration lifecycle test passed.");
  } finally {
    for (const socket of sockets) {
      socket.terminate();
    }

    await collaborationServer.close();
    await closeServer(httpServer);
  }
}

function createUser(id, displayName) {
  return {
    id,
    email: `${id}@example.com`,
    displayName,
  };
}

function authenticate(socket, token, expectedUserId) {
  const authenticated = waitForMessage(
    socket,
    (message) => message.type === "authenticated",
  );
  socket.send(JSON.stringify({ type: "authenticate", token }));

  return authenticated.then((message) => {
    assert.equal(message.user.id, expectedUserId);
  });
}

function waitForMessage(socket, predicate, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for a WebSocket message."));
    }, timeoutMs);

    function handleMessage(data) {
      const message = JSON.parse(data.toString("utf8"));

      if (!predicate(message)) {
        return;
      }

      cleanup();
      resolve(message);
    }

    function handleClose() {
      cleanup();
      reject(new Error("WebSocket closed before the expected message arrived."));
    }

    function cleanup() {
      clearTimeout(timeout);
      socket.off("message", handleMessage);
      socket.off("close", handleClose);
    }

    socket.on("message", handleMessage);
    socket.on("close", handleClose);
  });
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
