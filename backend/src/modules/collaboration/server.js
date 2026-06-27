const { WebSocket, WebSocketServer } = require("ws");

const { findUserById } = require("../auth/repository");
const { AuthTokenError, verifySessionToken } = require("../auth/tokens");
const { findDocumentForUser } = require("../documents/repository");
const {
  CollaborationProtocolError,
  parseClientMessage,
} = require("./protocol");
const { RoomManager } = require("./roomManager");

const AUTHENTICATION_TIMEOUT_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_WEBSOCKET_PAYLOAD_BYTES = 64 * 1024;
const EDIT_ROLES = new Set(["owner", "editor"]);

function attachCollaborationServer(httpServer, options = {}) {
  const roomManager = options.roomManager || new RoomManager();
  const authenticateToken = options.authenticateToken || defaultAuthenticateToken;
  const loadDocumentForUser =
    options.loadDocumentForUser || findDocumentForUser;
  const logger = options.logger || console;
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_WEBSOCKET_PAYLOAD_BYTES,
  });

  function handleUpgrade(request, socket, head) {
    const requestUrl = new URL(request.url || "/", "http://localhost");

    if (requestUrl.pathname !== "/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  }

  httpServer.on("upgrade", handleUpgrade);

  webSocketServer.on("connection", (socket) => {
    const client = {
      socket,
      user: null,
      rooms: new Map(),
      isAlive: true,
      messageQueue: Promise.resolve(),
      authenticationTimer: null,
    };
    socket.collaborationClient = client;

    client.authenticationTimer = setTimeout(() => {
      sendError(client, "AUTHENTICATION_TIMEOUT", "Authentication timed out.");
      socket.close(1008, "Authentication required");
    }, AUTHENTICATION_TIMEOUT_MS);
    client.authenticationTimer.unref?.();

    socket.on("pong", () => {
      client.isAlive = true;
    });

    socket.on("message", (data, isBinary) => {
      client.messageQueue = client.messageQueue
        .then(() =>
          handleClientMessage(client, data, isBinary, {
            authenticateToken,
            loadDocumentForUser,
            roomManager,
          }),
        )
        .catch((error) => {
          handleUnexpectedError(client, error, logger);
        });
    });

    socket.on("close", () => {
      clearTimeout(client.authenticationTimer);

      for (const room of roomManager.leaveAll(client)) {
        broadcastPresence(roomManager, room.documentId, room.participantCount);
      }
    });

    socket.on("error", (error) => {
      logger.warn?.("WebSocket client error:", error.message);
    });

    send(client, {
      type: "connected",
      authenticationRequired: true,
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of webSocketServer.clients) {
      const client = socket.collaborationClient;

      if (!client) {
        continue;
      }

      if (!client.isAlive) {
        socket.terminate();
        continue;
      }

      client.isAlive = false;
      socket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  async function close() {
    clearInterval(heartbeat);
    httpServer.off("upgrade", handleUpgrade);

    for (const socket of webSocketServer.clients) {
      socket.terminate();
    }

    await new Promise((resolve) => webSocketServer.close(resolve));
  }

  return {
    close,
    roomManager,
    webSocketServer,
  };
}

async function handleClientMessage(client, data, isBinary, dependencies) {
  let message;

  try {
    message = parseClientMessage(data, isBinary);
  } catch (error) {
    if (error instanceof CollaborationProtocolError) {
      sendError(client, error.code, error.message);
      return;
    }

    throw error;
  }

  if (message.type === "authenticate") {
    await authenticateClient(client, message.token, dependencies.authenticateToken);
    return;
  }

  if (!client.user) {
    sendError(client, "AUTHENTICATION_REQUIRED", "Authentication is required.");
    return;
  }

  if (message.type === "join_document") {
    await joinDocument(client, message.documentId, dependencies);
    return;
  }

  if (message.type === "leave_document") {
    leaveDocument(client, message.documentId, dependencies.roomManager);
    return;
  }

  if (message.type === "edit") {
    broadcastEdit(client, message, dependencies.roomManager);
  }
}

async function authenticateClient(client, token, authenticateToken) {
  if (client.user) {
    sendError(client, "ALREADY_AUTHENTICATED", "Client is already authenticated.");
    return;
  }

  const user = await authenticateToken(token);

  if (client.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  if (!user) {
    sendError(client, "AUTHENTICATION_FAILED", "Authentication failed.");
    client.socket.close(1008, "Authentication failed");
    return;
  }

  client.user = user;
  clearTimeout(client.authenticationTimer);
  send(client, {
    type: "authenticated",
    user: publicUser(user),
  });
}

async function joinDocument(client, documentId, dependencies) {
  const document = await dependencies.loadDocumentForUser(
    documentId,
    client.user.id,
  );

  if (client.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  if (!document) {
    sendError(client, "DOCUMENT_NOT_FOUND", "Document not found.", documentId);
    return;
  }

  const room = dependencies.roomManager.join(client, document);

  send(client, {
    type: "document_joined",
    documentId,
    permissionRole: room.membership.permissionRole,
    participantCount: room.participantCount,
  });

  if (room.isNewMember) {
    broadcastPresence(
      dependencies.roomManager,
      documentId,
      room.participantCount,
    );
  }
}

function leaveDocument(client, documentId, roomManager) {
  const room = roomManager.leave(client, documentId);

  if (!room) {
    sendError(client, "NOT_IN_ROOM", "Client has not joined this document.", documentId);
    return;
  }

  send(client, {
    type: "document_left",
    documentId,
  });
  broadcastPresence(roomManager, documentId, room.participantCount);
}

function broadcastEdit(client, message, roomManager) {
  const membership = roomManager.getMembership(client, message.documentId);

  if (!membership) {
    sendError(
      client,
      "NOT_IN_ROOM",
      "Join the document before publishing edits.",
      message.documentId,
    );
    return;
  }

  if (!EDIT_ROLES.has(membership.permissionRole)) {
    sendError(
      client,
      "EDIT_FORBIDDEN",
      "This document is read-only for the current user.",
      message.documentId,
    );
    return;
  }

  const sentAt = new Date().toISOString();

  send(client, {
    type: "edit_accepted",
    documentId: message.documentId,
    clientOperationId: message.clientOperationId,
    sentAt,
  });
  roomManager.broadcast(
    message.documentId,
    {
      type: "edit",
      documentId: message.documentId,
      clientOperationId: message.clientOperationId,
      operation: message.operation,
      user: publicUser(client.user),
      sentAt,
    },
    { exclude: client },
  );
}

function broadcastPresence(roomManager, documentId, participantCount) {
  roomManager.broadcast(documentId, {
    type: "presence",
    documentId,
    participantCount,
  });
}

async function defaultAuthenticateToken(token) {
  let payload;

  try {
    payload = verifySessionToken(token);
  } catch (error) {
    if (error instanceof AuthTokenError) {
      return null;
    }

    throw error;
  }

  return findUserById(payload.sub);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

function sendError(client, code, message, documentId) {
  send(client, {
    type: "error",
    code,
    message,
    ...(documentId ? { documentId } : {}),
  });
}

function send(client, message) {
  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(message));
  }
}

function handleUnexpectedError(client, error, logger) {
  logger.error?.("WebSocket message handling failed:", error);
  sendError(client, "INTERNAL_ERROR", "Unable to process the message.");
}

module.exports = { attachCollaborationServer };
