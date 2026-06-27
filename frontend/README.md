# Collaborative Text Editor Frontend

React and Vite client for the collaborative editor workspace.

The application includes registration and sign-in, persistent browser sessions,
editable account settings, document creation/listing/title updates/archiving,
email invitations, share-code joining, a full-page rich-text editor, live edit
synchronization, clear save/version status, and a persistent light/dark theme.
Viewer permissions are rendered read-only, while owner and editor changes are
submitted through the revisioned collaboration protocol.

`src/collaboration/client.ts` provides the authenticated WebSocket client used
to join document rooms and exchange revisioned edit operations. Room joins
return authoritative content and a revision. Call `sendEdit` with that revision;
accepted and remote edits return the transformed operation and next revision.
During local development, Vite proxies `/api` and `/ws` to the backend on port
5000. Set `VITE_API_BASE_URL` and `VITE_WEBSOCKET_URL` when the backend is
hosted separately.

```bash
npm install
npm run dev
```
