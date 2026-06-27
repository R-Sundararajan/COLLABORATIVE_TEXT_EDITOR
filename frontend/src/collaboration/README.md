# Frontend Collaboration Client

`client.ts` is the typed browser transport for the backend `/ws` protocol. It does not implement operational transform; it sends splices and exposes the server's authoritative transformed events to subscribers.

## Exports

| Export | Purpose |
| --- | --- |
| `DocumentPermissionRole` | Owner/editor/viewer union |
| `EditOperation` | String splice shape |
| `CollaborationUser` | Public realtime user shape |
| `CollaborationServerMessage` | Typed union of all server messages |
| `CollaborationClient` | Connection, subscription, room, edit, and disconnect API |

## Connection workflow

1. Construct with a non-empty bearer token and optional URL.
2. `connect()` opens a single-use socket and sends `authenticate` on `open`.
3. `authenticated` changes state to `authenticated` and resolves `connect()`.
4. Subscribers receive every parsed server message.
5. `joinDocument`, `leaveDocument`, and `sendEdit` require authenticated state.
6. `disconnect()` closes an open socket and permanently sets state to `closed`.

The client does not reconnect automatically and an instance cannot be reused after its first connection attempt. `Workspace` creates a new instance when the session token changes.

## Edit submission

`sendEdit(documentId, baseRevision, operation, clientOperationId?)` emits one edit and returns its operation ID. IDs use `crypto.randomUUID()` when available and a timestamp/random fallback otherwise.

Incoming JSON receives only lightweight structural checking (`message.type`). Detailed payload validation and revision/application rules live in `App.tsx` and the backend protocol/OT modules.

## Failure behavior

Socket errors or close during connection reject the pending `connect()` Promise. Non-string or invalid JSON messages are ignored. Sending before authentication or on a non-open socket throws synchronously.

## URL selection

`VITE_WEBSOCKET_URL` wins when configured. Otherwise the URL uses the page host and selects `wss:` for HTTPS pages or `ws:` for HTTP pages. Vite proxies `/ws` during local development.

Related: [frontend state](../README.md#realtime-state), [backend protocol](../../../backend/src/modules/collaboration/README.md), [OT engine](../../../backend/src/modules/operations/README.md), [full live workflow](../../../WORKFLOW.md#accepted-edit-flow).
