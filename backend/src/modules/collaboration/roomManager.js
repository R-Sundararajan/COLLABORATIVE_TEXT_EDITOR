const { WebSocket } = require("ws");
const { DocumentOperationState } = require("../operations/operationalTransform");

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  join(client, document) {
    let room = this.rooms.get(document.id);

    if (!room) {
      room = {
        members: new Map(),
        operationState: new DocumentOperationState({
          content: typeof document.content === "string" ? document.content : "",
          revision: Number.isSafeInteger(document.version) ? document.version : 0,
        }),
      };
      this.rooms.set(document.id, room);
    }

    const isNewMember = !room.members.has(client);
    const membership = {
      permissionRole: document.permissionRole,
    };

    room.members.set(client, membership);
    client.rooms.set(document.id, membership);

    return {
      isNewMember,
      participantCount: room.members.size,
      membership,
      content: room.operationState.content,
      revision: room.operationState.revision,
    };
  }

  leave(client, documentId) {
    const room = this.rooms.get(documentId);

    if (!room || !room.members.delete(client)) {
      client.rooms.delete(documentId);
      return null;
    }

    client.rooms.delete(documentId);

    const becameInactive = room.members.size === 0;

    if (becameInactive) {
      this.rooms.delete(documentId);
    }

    return {
      documentId,
      participantCount: room.members.size,
      becameInactive,
    };
  }

  leaveAll(client) {
    return [...client.rooms.keys()]
      .map((documentId) => this.leave(client, documentId))
      .filter(Boolean);
  }

  getMembership(client, documentId) {
    return client.rooms.get(documentId) || null;
  }

  getOperationState(documentId) {
    return this.rooms.get(documentId)?.operationState || null;
  }

  broadcast(documentId, message, { exclude } = {}) {
    const room = this.rooms.get(documentId);

    if (!room) {
      return 0;
    }

    const serializedMessage = JSON.stringify(message);
    let recipientCount = 0;

    for (const client of room.members.keys()) {
      if (client === exclude || client.socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      client.socket.send(serializedMessage);
      recipientCount += 1;
    }

    return recipientCount;
  }
}

module.exports = { RoomManager };
