const { WebSocket } = require("ws");

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  join(client, document) {
    let members = this.rooms.get(document.id);

    if (!members) {
      members = new Map();
      this.rooms.set(document.id, members);
    }

    const isNewMember = !members.has(client);
    const membership = {
      permissionRole: document.permissionRole,
    };

    members.set(client, membership);
    client.rooms.set(document.id, membership);

    return {
      isNewMember,
      participantCount: members.size,
      membership,
    };
  }

  leave(client, documentId) {
    const members = this.rooms.get(documentId);

    if (!members || !members.delete(client)) {
      client.rooms.delete(documentId);
      return null;
    }

    client.rooms.delete(documentId);

    if (members.size === 0) {
      this.rooms.delete(documentId);
    }

    return {
      documentId,
      participantCount: members.size,
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

  broadcast(documentId, message, { exclude } = {}) {
    const members = this.rooms.get(documentId);

    if (!members) {
      return 0;
    }

    const serializedMessage = JSON.stringify(message);
    let recipientCount = 0;

    for (const client of members.keys()) {
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
