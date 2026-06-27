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
  "operation": { "index": 0, "deleteCount": 0, "insertText": "Hello" }
}
```

The server acknowledges authentication, room joins/leaves, and accepted edits.
It broadcasts `presence` events to room members and `edit` events to all other
members of the document room. Owners and editors may publish edits; viewers
receive live events but cannot publish changes.

This phase intentionally broadcasts operations without transforming them.
Concurrent operation transformation belongs to the next project phase.
