/**
 * Provides the typed browser client for the authenticated `/ws` protocol.
 * Owns connection state, subscriptions, room commands, edit submission, and
 * default URL/operation-ID generation for the React workspace.
 */
export type DocumentPermissionRole = 'owner' | 'editor' | 'viewer'

export type EditOperation = {
  index: number
  deleteCount: number
  insertText: string
}

export type CollaborationUser = {
  id: string
  email?: string
  displayName: string
}

export type CollaborationServerMessage =
  | { type: 'connected'; authenticationRequired: true }
  | { type: 'authenticated'; user: CollaborationUser }
  | {
      type: 'document_joined'
      documentId: string
      permissionRole: DocumentPermissionRole
      participantCount: number
      content: string
      revision: number
    }
  | { type: 'document_left'; documentId: string }
  | { type: 'presence'; documentId: string; participantCount: number }
  | {
      type: 'edit_accepted'
      documentId: string
      clientOperationId: string
      operation: EditOperation
      revision: number
      sentAt: string
    }
  | {
      type: 'edit'
      documentId: string
      clientOperationId: string
      operation: EditOperation
      revision: number
      user: CollaborationUser
      sentAt: string
    }
  | {
      type: 'error'
      code: string
      message: string
      documentId?: string
      currentRevision?: number
    }

type CollaborationListener = (message: CollaborationServerMessage) => void
type ConnectionState = 'idle' | 'connecting' | 'authenticated' | 'closed'

type CollaborationClientOptions = {
  token: string
  url?: string
}

export class CollaborationClient {
  private readonly token: string
  private readonly url: string
  private readonly listeners = new Set<CollaborationListener>()
  private socket: WebSocket | null = null
  private connectionState: ConnectionState = 'idle'
  private resolveConnection: ((message: CollaborationServerMessage) => void) | null = null
  private rejectConnection: ((error: Error) => void) | null = null

  constructor({ token, url = defaultWebSocketUrl() }: CollaborationClientOptions) {
    if (!token) {
      throw new Error('A session token is required to connect.')
    }

    this.token = token
    this.url = url
  }

  get state(): ConnectionState {
    return this.connectionState
  }

  connect(): Promise<CollaborationServerMessage> {
    if (this.connectionState !== 'idle') {
      return Promise.reject(new Error('The collaboration client has already been used.'))
    }

    this.connectionState = 'connecting'
    this.socket = new WebSocket(this.url)
    this.socket.addEventListener('open', () => {
      this.sendRaw({ type: 'authenticate', token: this.token })
    })
    this.socket.addEventListener('message', (event) => {
      this.handleMessage(event.data)
    })
    this.socket.addEventListener('error', () => {
      this.rejectPendingConnection('Unable to connect to the collaboration server.')
    })
    this.socket.addEventListener('close', () => {
      this.connectionState = 'closed'
      this.rejectPendingConnection('The collaboration connection closed.')
    })

    return new Promise((resolve, reject) => {
      this.resolveConnection = resolve
      this.rejectConnection = reject
    })
  }

  subscribe(listener: CollaborationListener): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  joinDocument(documentId: string): void {
    this.sendAuthenticated({ type: 'join_document', documentId })
  }

  leaveDocument(documentId: string): void {
    this.sendAuthenticated({ type: 'leave_document', documentId })
  }

  sendEdit(
    documentId: string,
    baseRevision: number,
    operation: EditOperation,
    clientOperationId = createOperationId(),
  ): string {
    this.sendAuthenticated({
      type: 'edit',
      documentId,
      clientOperationId,
      baseRevision,
      operation,
    })

    return clientOperationId
  }

  disconnect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.close(1000, 'Client disconnected')
    }

    this.connectionState = 'closed'
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') {
      return
    }

    let message: CollaborationServerMessage

    try {
      message = JSON.parse(data) as CollaborationServerMessage
    } catch {
      return
    }

    if (!message || typeof message.type !== 'string') {
      return
    }

    if (message.type === 'authenticated') {
      this.connectionState = 'authenticated'
      this.resolveConnection?.(message)
      this.clearConnectionCallbacks()
    } else if (message.type === 'error' && this.connectionState === 'connecting') {
      this.rejectPendingConnection(message.message)
    }

    for (const listener of this.listeners) {
      listener(message)
    }
  }

  private sendAuthenticated(message: object): void {
    if (this.connectionState !== 'authenticated') {
      throw new Error('The collaboration client is not authenticated.')
    }

    this.sendRaw(message)
  }

  private sendRaw(message: object): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error('The collaboration connection is not open.')
    }

    this.socket.send(JSON.stringify(message))
  }

  private rejectPendingConnection(message: string): void {
    this.rejectConnection?.(new Error(message))
    this.clearConnectionCallbacks()
  }

  private clearConnectionCallbacks(): void {
    this.resolveConnection = null
    this.rejectConnection = null
  }
}

function defaultWebSocketUrl(): string {
  if (import.meta.env.VITE_WEBSOCKET_URL) {
    return import.meta.env.VITE_WEBSOCKET_URL
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

function createOperationId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
