# Frontend

The frontend is a React 19 and TypeScript single-page application built by Vite. It implements authentication screens, the document workspace, sharing/account dialogs, a sanitized rich-text surface, and the HTTP/WebSocket synchronization client.

## Structure

```text
frontend/
|-- src/
|   |-- main.tsx                 # React root
|   |-- App.tsx                  # Screens, workspace, dialogs, sync state
|   |-- api.ts                   # Typed HTTP models/helper
|   |-- collaboration/client.ts  # Typed WebSocket transport
|   |-- index.css                # Theme tokens and global styles
|   `-- App.css                  # Application and responsive layout
|-- index.html
|-- vite.config.ts
|-- eslint.config.js
`-- package.json
```

See the [frontend source map](src/README.md) for component and state responsibilities.

## User workflows

- Register, sign in, restore a stored token, and sign out.
- Change display name, email, or password after current-password verification.
- Create, select, title, archive, and join documents.
- Invite existing users or generate/copy a role-scoped share code.
- Format rich text, receive live changes, view revision/save state and text counts.
- View shared content read-only when the permission role is viewer.
- Persist the light/dark theme and adapt the layout at 980, 760, and 560 pixel breakpoints.

## Data access

`apiRequest()` uses `VITE_API_BASE_URL` when configured and otherwise uses same-origin paths. It supplies JSON and bearer headers, parses JSON successes, handles 204, and converts API error bodies into `ApiError`.

`CollaborationClient` uses `VITE_WEBSOCKET_URL` or derives `ws://`/`wss://` from the current page. It authenticates immediately on open, exposes subscribe/join/leave/edit/disconnect operations, and dispatches the typed server protocol.

During development Vite proxies `/api` and `/ws` to `http://localhost:5000`.

## Editor behavior

The contenteditable surface stores serialized HTML. Formatting output is sanitized to allowed tags with only `text-align` style retained; paste is converted to plain text. Each change becomes a single prefix/suffix-derived replacement splice. The UI allows one pending local edit and waits for the server acknowledgement before accepting another.

The frontend maintains separate optimistic and authoritative content. It applies only contiguous server revisions and rejoins after gaps, invalid operations, stale revision errors, or unexpected acknowledgements.

## Commands

```bash
npm install
npm run dev
npm run lint
npm run build
npm run preview
```

The backend does not serve the production output. Deploy `dist/` separately and point the two public Vite variables to the backend.

## Related documentation

- [Frontend source map](src/README.md)
- [WebSocket client](src/collaboration/README.md)
- [Backend collaboration protocol](../backend/src/modules/collaboration/README.md)
- [Full engineering workflow](../WORKFLOW.md)
- [Root running guide](../README.md#running-locally)
