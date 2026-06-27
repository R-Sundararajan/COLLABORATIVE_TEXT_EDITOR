# Collaborative Text Editor Frontend

React and Vite scaffold for the collaborative editor workspace.

`src/collaboration/client.ts` provides the authenticated WebSocket client used
to join document rooms and exchange revisioned edit operations. Room joins
return authoritative content and a revision. Call `sendEdit` with that revision;
accepted and remote edits return the transformed operation and next revision.
During local development, Vite proxies `/ws` to the backend on port 5000. Set
`VITE_WEBSOCKET_URL` to override the WebSocket endpoint.

```bash
npm install
npm run dev
```
