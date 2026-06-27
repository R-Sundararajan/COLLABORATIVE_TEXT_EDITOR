# Collaboration Module

The collaboration server is attached to the backend HTTP server at `/ws`.
Clients authenticate with the same JWT issued by the HTTP authentication API,
then join one or more document rooms before sending edits.

## Client messages

```json
{ "type": "authenticate", "token": "<jwt>" }
{ "type": "join_document", "documentId": "<uuid>" }
{ "type": "leave_document", "documentId": "<uuid>" }
{
  "type": "edit",
  "documentId": "<uuid>",
  "clientOperationId": "<client-generated-id>",
  "baseRevision": 0,
  "operation": { "index": 0, "deleteCount": 0, "insertText": "Hello" }
}
```

The server acknowledges authentication, room joins/leaves, and accepted edits.
`document_joined` includes the authoritative `content` and `revision`. Every
`edit_accepted` acknowledgement and broadcast `edit` includes the transformed
operation and its new revision. It broadcasts `presence` events to room members
and accepted `edit` events to all other members of the document room. Owners and
editors may publish edits; viewers receive live events but cannot publish
changes.

Edits based on older retained revisions are transformed through newer edits.
Invalid ranges, future revisions, and revisions older than the bounded history
are rejected with protocol errors that include the server's current revision.
