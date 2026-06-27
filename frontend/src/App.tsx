import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import {
  ApiError,
  apiRequest,
  type DocumentRecord,
  type Session,
  type SessionResponse,
  type User,
} from './api'
import {
  CollaborationClient,
  type CollaborationServerMessage,
  type EditOperation,
} from './collaboration/client'

const SESSION_TOKEN_KEY = 'collab-text-session-token'
const THEME_KEY = 'collab-text-theme'

type Theme = 'light' | 'dark'
type TransportState = 'connecting' | 'online' | 'offline'

type EditorState = {
  content: string
  revision: number
  participantCount: number
  permissionRole: DocumentRecord['permissionRole'] | null
  joined: boolean
  pending: boolean
  error: string | null
}

const EMPTY_EDITOR: EditorState = {
  content: '',
  revision: 0,
  participantCount: 0,
  permissionRole: null,
  joined: false,
  pending: false,
  error: null,
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [session, setSession] = useState<Session | null>(null)
  const [checkingSession, setCheckingSession] = useState(() =>
    Boolean(localStorage.getItem(SESSION_TOKEN_KEY)),
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    const token = localStorage.getItem(SESSION_TOKEN_KEY)

    if (!token) {
      return
    }

    let cancelled = false

    apiRequest<{ authenticated: true; user: User }>(
      '/api/auth/session',
      {},
      token,
    )
      .then(({ user }) => {
        if (!cancelled) {
          setSession({ token, user })
        }
      })
      .catch(() => {
        localStorage.removeItem(SESSION_TOKEN_KEY)
      })
      .finally(() => {
        if (!cancelled) {
          setCheckingSession(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const toggleTheme = () => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'))
  }

  const handleAuthenticated = (nextSession: Session) => {
    localStorage.setItem(SESSION_TOKEN_KEY, nextSession.token)
    setSession(nextSession)
  }

  const handleLogout = () => {
    localStorage.removeItem(SESSION_TOKEN_KEY)
    setSession(null)
  }

  const handleSessionUpdate = (user: User) => {
    setSession((current) => (current ? { ...current, user } : current))
  }

  if (checkingSession) {
    return <LoadingScreen theme={theme} onToggleTheme={toggleTheme} />
  }

  if (!session) {
    return (
      <AuthScreen
        theme={theme}
        onAuthenticated={handleAuthenticated}
        onToggleTheme={toggleTheme}
      />
    )
  }

  return (
    <Workspace
      session={session}
      theme={theme}
      onLogout={handleLogout}
      onSessionUpdate={handleSessionUpdate}
      onToggleTheme={toggleTheme}
    />
  )
}

function Workspace({
  session,
  theme,
  onLogout,
  onSessionUpdate,
  onToggleTheme,
}: {
  session: Session
  theme: Theme
  onLogout: () => void
  onSessionUpdate: (user: User) => void
  onToggleTheme: () => void
}) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR)
  const [transport, setTransport] = useState<TransportState>('connecting')
  const [loadingDocuments, setLoadingDocuments] = useState(true)
  const [creatingDocument, setCreatingDocument] = useState(false)
  const [deletingDocument, setDeletingDocument] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [showShare, setShowShare] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showAccount, setShowAccount] = useState(false)

  const collaborationRef = useRef<CollaborationClient | null>(null)
  const activeDocumentIdRef = useRef<string | null>(null)
  const requestedDocumentIdRef = useRef<string | null>(null)
  const authoritativeContentRef = useRef('')
  const revisionRef = useRef(0)
  const pendingOperationIdRef = useRef<string | null>(null)
  const richEditorRef = useRef<HTMLDivElement | null>(null)
  const suppressRichInputRef = useRef(false)
  const savedSelectionRef = useRef<Range | null>(null)

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) || null,
    [documents, selectedDocumentId],
  )
  const canEdit = editor.permissionRole === 'owner' || editor.permissionRole === 'editor'
  const wordCount = countWords(editor.content)

  useEffect(() => {
    const element = richEditorRef.current
    const safeContent = sanitizeRichText(editor.content)

    if (element && element.innerHTML !== safeContent) {
      element.innerHTML = safeContent
      savedSelectionRef.current = null
    }
  }, [editor.content, selectedDocumentId])

  const loadDocuments = useCallback(async () => {
    setLoadingDocuments(true)
    setNotice(null)

    try {
      const response = await apiRequest<{ documents: DocumentRecord[] }>(
        '/api/documents',
        {},
        session.token,
      )
      setDocuments(response.documents)
      setSelectedDocumentId((current) => {
        if (current && response.documents.some((document) => document.id === current)) {
          return current
        }

        return response.documents[0]?.id || null
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onLogout()
        return
      }

      setNotice(errorMessage(error))
    } finally {
      setLoadingDocuments(false)
    }
  }, [onLogout, session.token])

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  useEffect(() => {
    activeDocumentIdRef.current = selectedDocumentId
  }, [selectedDocumentId])

  useEffect(() => {
    const client = new CollaborationClient({ token: session.token })
    collaborationRef.current = client
    setTransport('connecting')

    const resynchronize = (message: string) => {
      const documentId = activeDocumentIdRef.current
      pendingOperationIdRef.current = null
      setEditor((current) => ({ ...current, pending: false, error: message }))

      if (!documentId || client.state !== 'authenticated') {
        return
      }

      try {
        if (requestedDocumentIdRef.current === documentId) {
          client.leaveDocument(documentId)
        }
        requestedDocumentIdRef.current = documentId
        client.joinDocument(documentId)
      } catch {
        setTransport('offline')
      }
    }

    const unsubscribe = client.subscribe((message) => {
      handleCollaborationMessage(message, {
        client,
        activeDocumentIdRef,
        requestedDocumentIdRef,
        authoritativeContentRef,
        revisionRef,
        pendingOperationIdRef,
        setDocuments,
        setEditor,
        resynchronize,
      })
    })

    client
      .connect()
      .then(() => {
        if (collaborationRef.current !== client) {
          return
        }

        setTransport('online')

        const documentId = activeDocumentIdRef.current

        if (documentId && requestedDocumentIdRef.current !== documentId) {
          requestedDocumentIdRef.current = documentId
          client.joinDocument(documentId)
        }
      })
      .catch((error) => {
        if (collaborationRef.current !== client) {
          return
        }

        setTransport('offline')
        setNotice(errorMessage(error))
      })

    return () => {
      unsubscribe()
      client.disconnect()
      collaborationRef.current = null
    }
  }, [session.token])

  useEffect(() => {
    const client = collaborationRef.current

    if (!selectedDocumentId) {
      requestedDocumentIdRef.current = null
      pendingOperationIdRef.current = null
      authoritativeContentRef.current = ''
      revisionRef.current = 0
      setEditor(EMPTY_EDITOR)
      return
    }

    setEditor({ ...EMPTY_EDITOR })

    if (!client || transport !== 'online') {
      return
    }

    const previousDocumentId = requestedDocumentIdRef.current

    try {
      if (previousDocumentId && previousDocumentId !== selectedDocumentId) {
        client.leaveDocument(previousDocumentId)
      }
      requestedDocumentIdRef.current = selectedDocumentId
      client.joinDocument(selectedDocumentId)
    } catch (error) {
      if (requestedDocumentIdRef.current === selectedDocumentId) {
        requestedDocumentIdRef.current = null
      }
      setNotice(errorMessage(error))
    }
  }, [selectedDocumentId, transport])

  const createDocument = async () => {
    setCreatingDocument(true)
    setNotice(null)

    try {
      const response = await apiRequest<{ document: DocumentRecord }>(
        '/api/documents',
        {
          method: 'POST',
          body: JSON.stringify({
            title: 'Untitled document',
            content: '',
            metadata: {},
          }),
        },
        session.token,
      )
      setDocuments((current) => [
        response.document,
        ...current.filter((document) => document.id !== response.document.id),
      ])
      setSelectedDocumentId(response.document.id)
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setCreatingDocument(false)
    }
  }

  const joinDocument = async (code: string) => {
    const response = await apiRequest<{ document: DocumentRecord }>(
      '/api/documents/join',
      { method: 'POST', body: JSON.stringify({ code }) },
      session.token,
    )
    setDocuments((current) => [
      response.document,
      ...current.filter((document) => document.id !== response.document.id),
    ])
    setSelectedDocumentId(response.document.id)
    setShowJoin(false)
  }

  const saveTitle = async () => {
    if (!selectedDocument || !canEdit) {
      return
    }

    const title = selectedDocument.title.trim()

    if (!title) {
      setNotice('A document title is required.')
      void loadDocuments()
      return
    }

    try {
      const response = await apiRequest<{ document: DocumentRecord }>(
        `/api/documents/${selectedDocument.id}`,
        { method: 'PATCH', body: JSON.stringify({ title }) },
        session.token,
      )
      replaceDocument(setDocuments, response.document)
    } catch (error) {
      setNotice(errorMessage(error))
      void loadDocuments()
    }
  }

  const deleteDocument = async () => {
    if (!selectedDocument || selectedDocument.permissionRole !== 'owner') {
      return
    }

    if (!window.confirm(`Archive “${selectedDocument.title}”?`)) {
      return
    }

    setDeletingDocument(true)
    setNotice(null)

    try {
      await apiRequest<void>(
        `/api/documents/${selectedDocument.id}`,
        { method: 'DELETE' },
        session.token,
      )
      const remaining = documents.filter(
        (document) => document.id !== selectedDocument.id,
      )
      setDocuments(remaining)
      setSelectedDocumentId(remaining[0]?.id || null)
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setDeletingDocument(false)
    }
  }

  const editContent = (nextContent: string) => {
    const client = collaborationRef.current

    if (
      !client ||
      !selectedDocumentId ||
      !editor.joined ||
      editor.pending ||
      !canEdit
    ) {
      return
    }

    const operation = createEditOperation(editor.content, nextContent)

    if (!operation) {
      return
    }

    setEditor((current) => ({
      ...current,
      content: nextContent,
      pending: true,
      error: null,
    }))

    try {
      pendingOperationIdRef.current = client.sendEdit(
        selectedDocumentId,
        revisionRef.current,
        operation,
      )
    } catch (error) {
      pendingOperationIdRef.current = null
      setEditor((current) => ({
        ...current,
        content: authoritativeContentRef.current,
        pending: false,
        error: errorMessage(error),
      }))
    }
  }

  const applyTextFormat = (command: string, value?: string) => {
    const element = richEditorRef.current

    if (!element || !canEdit || editor.pending || !editor.joined) {
      return
    }

    const selection = window.getSelection()

    if (selection && savedSelectionRef.current) {
      selection.removeAllRanges()
      selection.addRange(savedSelectionRef.current)
    } else {
      element.focus()
    }
    suppressRichInputRef.current = true
    document.execCommand(command, false, value)
    suppressRichInputRef.current = false

    const safeContent = sanitizeRichText(element.innerHTML)

    if (element.innerHTML !== safeContent) {
      element.innerHTML = safeContent
    }

    if (safeContent !== editor.content) {
      editContent(safeContent)
    }
  }

  const rememberEditorSelection = () => {
    const element = richEditorRef.current
    const selection = window.getSelection()

    if (!element || !selection || selection.rangeCount === 0) {
      return
    }

    const range = selection.getRangeAt(0)

    if (element.contains(range.commonAncestorContainer)) {
      savedSelectionRef.current = range.cloneRange()
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Document navigation">
        <div className="brand-row">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">C</span>
            <span>Collab</span>
          </div>
          <ThemeButton theme={theme} onClick={onToggleTheme} />
        </div>

        <div className="sidebar-heading">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2>Documents</h2>
          </div>
          <div className="sidebar-actions">
            <button
              className="icon-button"
              type="button"
              aria-label="Join shared document"
              title="Join shared document"
              onClick={() => setShowJoin(true)}
            >
              ↳
            </button>
            <button
              className="icon-button accent-button"
              type="button"
              aria-label="Create document"
              title="Create document"
              disabled={creatingDocument}
              onClick={() => void createDocument()}
            >
              {creatingDocument ? <span className="spinner" /> : '+'}
            </button>
          </div>
        </div>

        <nav className="document-list" aria-label="Documents">
          {loadingDocuments ? (
            <DocumentListSkeleton />
          ) : documents.length > 0 ? (
            documents.map((document) => (
              <button
                className={`document-item${
                  document.id === selectedDocumentId ? ' selected' : ''
                }`}
                type="button"
                key={document.id}
                onClick={() => setSelectedDocumentId(document.id)}
              >
                <span className="document-icon" aria-hidden="true">≡</span>
                <span className="document-copy">
                  <strong>{document.title}</strong>
                  <small>{formatRelativeDate(document.updatedAt)}</small>
                </span>
                {document.permissionRole !== 'owner' && (
                  <span className="role-dot" title={document.permissionRole} />
                )}
              </button>
            ))
          ) : (
            <div className="sidebar-empty">
              <span aria-hidden="true">◇</span>
              <p>No documents yet</p>
              <small>Create one to start writing.</small>
            </div>
          )}
        </nav>

        <button
          className="account-card"
          type="button"
          aria-label="Open account settings"
          onClick={() => setShowAccount(true)}
        >
          <span className="avatar">{initials(session.user.displayName)}</span>
          <span className="account-copy">
            <strong>{session.user.displayName}</strong>
            <small>{session.user.email}</small>
          </span>
          <span className="account-settings-icon" aria-hidden="true">⚙</span>
        </button>
      </aside>

      <section className="workspace" aria-label="Document workspace">
        {notice && (
          <div className="notice" role="alert">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
          </div>
        )}

        {selectedDocument ? (
          <>
            <header className="topbar">
              <div className="title-field">
                <input
                  aria-label="Document title"
                  value={selectedDocument.title}
                  maxLength={200}
                  readOnly={!canEdit}
                  onChange={(event) => {
                    const title = event.target.value
                    setDocuments((current) =>
                      current.map((document) =>
                        document.id === selectedDocument.id
                          ? { ...document, title }
                          : document,
                      ),
                    )
                  }}
                  onBlur={() => void saveTitle()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur()
                    }
                  }}
                />
              </div>

              <FormattingToolbar
                disabled={!editor.joined || !canEdit || editor.pending}
                onCommand={applyTextFormat}
              />

              <div className="topbar-actions">
                {selectedDocument.permissionRole === 'owner' && (
                  <button
                    className="button button-primary share-button"
                    type="button"
                    onClick={() => setShowShare(true)}
                  >
                    Share
                  </button>
                )}
                {selectedDocument.permissionRole === 'owner' && (
                  <button
                    className="icon-button archive-button"
                    type="button"
                    aria-label="Archive document"
                    title="Archive document"
                    disabled={deletingDocument}
                    onClick={() => void deleteDocument()}
                  >
                    ⋯
                  </button>
                )}
              </div>
            </header>

            <div className="editor-stage">
              <div className="editor-card">
                <div className="editor-surface">
                  {!editor.joined && (
                    <div className="editor-loading" aria-live="polite">
                      <span className="spinner spinner-dark" />
                      Joining live document…
                    </div>
                  )}
                  <div
                    ref={richEditorRef}
                    className="rich-editor"
                    role="textbox"
                    aria-label="Document body"
                    aria-multiline="true"
                    aria-readonly={!editor.joined || !canEdit || editor.pending}
                    contentEditable={editor.joined && canEdit && !editor.pending}
                    data-placeholder="Start writing something worth sharing…"
                    spellCheck
                    suppressContentEditableWarning
                    onInput={(event) => {
                      if (!suppressRichInputRef.current) {
                        const safeContent = sanitizeRichText(
                          event.currentTarget.innerHTML,
                        )

                        if (event.currentTarget.innerHTML !== safeContent) {
                          event.currentTarget.innerHTML = safeContent
                        }
                        editContent(safeContent)
                      }
                    }}
                    onBlur={rememberEditorSelection}
                    onKeyUp={rememberEditorSelection}
                    onMouseUp={rememberEditorSelection}
                    onSelect={rememberEditorSelection}
                    onPaste={(event) => {
                      event.preventDefault()
                      document.execCommand(
                        'insertText',
                        false,
                        event.clipboardData.getData('text/plain'),
                      )
                    }}
                  />
                </div>

                <footer className="editor-footer">
                  <div className="footer-stats">
                    <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
                    <span>{plainTextLength(editor.content)} characters</span>
                    <span
                      className="document-version"
                      title="Document version: increments after each accepted change"
                    >
                      Version {editor.revision}
                    </span>
                    <span className="permission-label">
                      {editor.permissionRole || 'connecting'} access
                    </span>
                  </div>
                  <div className={`save-state${editor.error ? ' error' : ''}`}>
                    <span className="save-dot" />
                    {editor.error || (transport === 'offline' ? 'Connection unavailable' :
                      (editor.pending
                        ? 'Syncing change…'
                        : editor.joined
                          ? 'All changes saved'
                          : 'Connecting…'))}
                  </div>
                </footer>
              </div>
            </div>
          </>
        ) : (
          <EmptyWorkspace
            loading={loadingDocuments}
            creating={creatingDocument}
            onCreate={() => void createDocument()}
          />
        )}
      </section>

      {showJoin && (
        <JoinDocumentDialog
          onClose={() => setShowJoin(false)}
          onJoin={joinDocument}
        />
      )}
      {showShare && selectedDocument && (
        <ShareDocumentDialog
          document={selectedDocument}
          token={session.token}
          onClose={() => setShowShare(false)}
        />
      )}
      {showAccount && (
        <AccountDialog
          session={session}
          onClose={() => setShowAccount(false)}
          onLogout={onLogout}
          onSaved={onSessionUpdate}
        />
      )}
    </main>
  )
}

type CollaborationContext = {
  client: CollaborationClient
  activeDocumentIdRef: React.MutableRefObject<string | null>
  requestedDocumentIdRef: React.MutableRefObject<string | null>
  authoritativeContentRef: React.MutableRefObject<string>
  revisionRef: React.MutableRefObject<number>
  pendingOperationIdRef: React.MutableRefObject<string | null>
  setDocuments: React.Dispatch<React.SetStateAction<DocumentRecord[]>>
  setEditor: React.Dispatch<React.SetStateAction<EditorState>>
  resynchronize: (message: string) => void
}

function handleCollaborationMessage(
  message: CollaborationServerMessage,
  context: CollaborationContext,
) {
  const documentId = 'documentId' in message ? message.documentId : null

  if (message.type === 'document_joined') {
    if (message.documentId !== context.activeDocumentIdRef.current) {
      context.client.leaveDocument(message.documentId)
      return
    }

    context.requestedDocumentIdRef.current = message.documentId
    context.authoritativeContentRef.current = message.content
    context.revisionRef.current = message.revision
    context.pendingOperationIdRef.current = null
    context.setEditor({
      content: message.content,
      revision: message.revision,
      participantCount: message.participantCount,
      permissionRole: message.permissionRole,
      joined: true,
      pending: false,
      error: null,
    })
    context.setDocuments((current) =>
      current.map((document) =>
        document.id === message.documentId
          ? { ...document, content: message.content, version: message.revision }
          : document,
      ),
    )
    return
  }

  if (!documentId || documentId !== context.activeDocumentIdRef.current) {
    return
  }

  if (message.type === 'presence') {
    context.setEditor((current) => ({
      ...current,
      participantCount: message.participantCount,
    }))
    return
  }

  if (message.type === 'edit' || message.type === 'edit_accepted') {
    if (message.revision <= context.revisionRef.current) {
      return
    }

    if (message.revision !== context.revisionRef.current + 1) {
      context.resynchronize('Live changes were resynchronized.')
      return
    }

    try {
      context.authoritativeContentRef.current = applyOperation(
        context.authoritativeContentRef.current,
        message.operation,
      )
    } catch {
      context.resynchronize('Live changes were resynchronized.')
      return
    }

    context.revisionRef.current = message.revision

    if (message.type === 'edit_accepted') {
      if (message.clientOperationId !== context.pendingOperationIdRef.current) {
        context.resynchronize('The editor recovered from an unexpected acknowledgement.')
        return
      }
      context.pendingOperationIdRef.current = null
    }

    const hasPendingOperation = context.pendingOperationIdRef.current !== null
    context.setEditor((current) => ({
      ...current,
      content: hasPendingOperation
        ? current.content
        : context.authoritativeContentRef.current,
      revision: message.revision,
      pending: hasPendingOperation,
      error: null,
    }))
    context.setDocuments((current) =>
      current.map((document) =>
        document.id === documentId
          ? {
              ...document,
              content: context.authoritativeContentRef.current,
              version: message.revision,
              updatedAt: message.sentAt,
            }
          : document,
      ),
    )
    return
  }

  if (message.type === 'error') {
    const recoverableCodes = new Set([
      'INVALID_REVISION',
      'REVISION_AHEAD',
      'REVISION_TOO_OLD',
      'OPERATION_OUT_OF_BOUNDS',
    ])

    if (recoverableCodes.has(message.code)) {
      context.resynchronize(message.message)
    } else {
      context.pendingOperationIdRef.current = null
      context.setEditor((current) => ({
        ...current,
        content: context.authoritativeContentRef.current,
        pending: false,
        error: message.message,
      }))
    }
  }
}

function FormattingToolbar({
  disabled,
  onCommand,
}: {
  disabled: boolean
  onCommand: (command: string, value?: string) => void
}) {
  const preserveSelection = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault()
  }

  return (
    <div className="formatting-toolbar" role="toolbar" aria-label="Text formatting">
      <select
        aria-label="Text style"
        disabled={disabled}
        defaultValue="p"
        onChange={(event) => onCommand('formatBlock', event.target.value)}
      >
        <option value="p">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="blockquote">Quote</option>
      </select>
      <span className="toolbar-divider" />
      <FormatButton label="Bold" disabled={disabled} onMouseDown={preserveSelection} onClick={() => onCommand('bold')}>
        <strong>B</strong>
      </FormatButton>
      <FormatButton label="Italic" disabled={disabled} onMouseDown={preserveSelection} onClick={() => onCommand('italic')}>
        <em>I</em>
      </FormatButton>
      <FormatButton label="Underline" disabled={disabled} onMouseDown={preserveSelection} onClick={() => onCommand('underline')}>
        <u>U</u>
      </FormatButton>
      <span className="toolbar-divider" />
      <FormatButton label="Align left" disabled={disabled} onMouseDown={preserveSelection} onClick={() => onCommand('justifyLeft')}>≡</FormatButton>
      <FormatButton label="Align center" disabled={disabled} onMouseDown={preserveSelection} onClick={() => onCommand('justifyCenter')}>≣</FormatButton>
      <FormatButton label="Align right" disabled={disabled} onMouseDown={preserveSelection} onClick={() => onCommand('justifyRight')}>≡</FormatButton>
      <span className="toolbar-divider" />
      <FormatButton label="Bulleted list" disabled={disabled} onMouseDown={preserveSelection} onClick={() => onCommand('insertUnorderedList')}>•≡</FormatButton>
      <FormatButton label="Numbered list" disabled={disabled} onMouseDown={preserveSelection} onClick={() => onCommand('insertOrderedList')}>1.</FormatButton>
      <FormatButton label="Undo" disabled={disabled} onMouseDown={preserveSelection} onClick={() => onCommand('undo')}>↶</FormatButton>
      <FormatButton label="Redo" disabled={disabled} onMouseDown={preserveSelection} onClick={() => onCommand('redo')}>↷</FormatButton>
    </div>
  )
}

function FormatButton({
  children,
  disabled,
  label,
  onClick,
  onMouseDown,
}: {
  children: React.ReactNode
  disabled: boolean
  label: string
  onClick: () => void
  onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      className="format-button"
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

type DocumentMember = {
  user: User
  role: DocumentRecord['permissionRole']
  sharedAt?: string
}

function ShareDocumentDialog({
  document,
  token,
  onClose,
}: {
  document: DocumentRecord
  token: string
  onClose: () => void
}) {
  const [members, setMembers] = useState<DocumentMember[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [shareCode, setShareCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadMembers = useCallback(async () => {
    try {
      const response = await apiRequest<{ members: DocumentMember[] }>(
        `/api/documents/${document.id}/members`,
        {},
        token,
      )
      setMembers(response.members)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [document.id, token])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  const shareWithEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await apiRequest(
        `/api/documents/${document.id}/share`,
        { method: 'POST', body: JSON.stringify({ email, role }) },
        token,
      )
      setEmail('')
      await loadMembers()
    } catch (shareError) {
      setError(errorMessage(shareError))
    } finally {
      setSubmitting(false)
    }
  }

  const createLink = async () => {
    setSubmitting(true)
    setError(null)

    try {
      const response = await apiRequest<{
        shareLink: { code: string; role: 'editor' | 'viewer' }
      }>(
        `/api/documents/${document.id}/share-link`,
        { method: 'POST', body: JSON.stringify({ role }) },
        token,
      )
      setShareCode(response.shareLink.code)
      setCopied(false)
    } catch (shareError) {
      setError(errorMessage(shareError))
    } finally {
      setSubmitting(false)
    }
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(shareCode)
      setCopied(true)
    } catch {
      setError('Copy was unavailable. Select the code and copy it manually.')
    }
  }

  return (
    <Modal title={`Share “${document.title}”`} onClose={onClose}>
      <p className="modal-intro">
        Invite an existing account or create a code anyone can use to join.
      </p>
      {error && <div className="form-error" role="alert">{error}</div>}

      <form className="share-form" onSubmit={shareWithEmail}>
        <label>
          Invite by email
          <input
            type="email"
            value={email}
            required
            placeholder="teammate@example.com"
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Access
          <select value={role} onChange={(event) => setRole(event.target.value as 'editor' | 'viewer')}>
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
        </label>
        <button className="button button-primary" type="submit" disabled={submitting}>Invite</button>
      </form>

      <div className="share-code-section">
        <div>
          <strong>Share code</strong>
          <small>Codes grant the access level selected above.</small>
        </div>
        {shareCode ? (
          <div className="share-code-row">
            <code>{shareCode}</code>
            <button className="button" type="button" onClick={() => void copyCode()}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        ) : (
          <button className="button" type="button" disabled={submitting} onClick={() => void createLink()}>
            Create code
          </button>
        )}
      </div>

      <div className="member-list">
        <p className="eyebrow">People with access</p>
        {loading ? <span className="spinner spinner-dark" /> : members.map((member) => (
          <div className="member-row" key={member.user.id}>
            <span className="avatar avatar-small">{initials(member.user.displayName)}</span>
            <span className="member-copy">
              <strong>{member.user.displayName}</strong>
              <small>{member.user.email}</small>
            </span>
            <span className="member-role">{member.role}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function JoinDocumentDialog({
  onClose,
  onJoin,
}: {
  onClose: () => void
  onJoin: (code: string) => Promise<void>
}) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await onJoin(code)
    } catch (joinError) {
      setError(errorMessage(joinError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Join a shared document" onClose={onClose}>
      <p className="modal-intro">Enter the 12-character code sent by the document owner.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <form className="modal-form" onSubmit={submit}>
        <label>
          Share code
          <input
            className="code-input"
            value={code}
            minLength={12}
            maxLength={12}
            required
            autoFocus
            placeholder="A1B2C3D4E5F6"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </label>
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting ? 'Joining…' : 'Join document'}
        </button>
      </form>
    </Modal>
  )
}

function AccountDialog({
  session,
  onClose,
  onLogout,
  onSaved,
}: {
  session: Session
  onClose: () => void
  onLogout: () => void
  onSaved: (user: User) => void
}) {
  const [displayName, setDisplayName] = useState(session.user.displayName)
  const [email, setEmail] = useState(session.user.email)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    setError(null)

    const changes = {
      currentPassword,
      ...(email !== session.user.email ? { email } : {}),
      ...(displayName !== session.user.displayName ? { displayName } : {}),
      ...(newPassword ? { newPassword } : {}),
    }

    if (Object.keys(changes).length === 1) {
      setError('Change your name, email, or password before saving.')
      setSubmitting(false)
      return
    }

    try {
      const response = await apiRequest<{ user: User }>(
        '/api/auth/me',
        { method: 'PATCH', body: JSON.stringify(changes) },
        session.token,
      )
      onSaved(response.user)
      setCurrentPassword('')
      setNewPassword('')
      setMessage('Account details updated.')
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Account settings" onClose={onClose}>
      <div className="account-dialog-header">
        <span className="avatar account-avatar">{initials(session.user.displayName)}</span>
        <div><strong>{session.user.displayName}</strong><small>Your personal account</small></div>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {message && <div className="form-success" role="status">{message}</div>}
      <form className="modal-form" onSubmit={submit}>
        <label>Display name<input value={displayName} minLength={2} required onChange={(event) => setDisplayName(event.target.value)} /></label>
        <label>Email address<input type="email" value={email} required onChange={(event) => setEmail(event.target.value)} /></label>
        <div className="form-grid">
          <label>Current password<input type="password" value={currentPassword} required onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label>New password <small>Optional</small><input type="password" value={newPassword} minLength={8} onChange={(event) => setNewPassword(event.target.value)} /></label>
        </div>
        <div className="modal-actions">
          <button className="button button-danger" type="button" onClick={onLogout}>Sign out</button>
          <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  )
}

function Modal({
  children,
  title,
  onClose,
}: {
  children: React.ReactNode
  title: string
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  )
}

function AuthScreen({
  theme,
  onAuthenticated,
  onToggleTheme,
}: {
  theme: Theme
  onAuthenticated: (session: Session) => void
  onToggleTheme: () => void
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const response = await apiRequest<SessionResponse>(`/api/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ email, password, ...(mode === 'register' && { displayName }) }),
      })
      onAuthenticated({ token: response.token, user: response.user })
    } catch (submitError) {
      setError(errorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story" aria-label="Product introduction">
        <div className="auth-brand">
          <span className="brand-mark">C</span>
          <span>Collab</span>
        </div>
        <div className="story-copy">
          <p className="eyebrow">Write together</p>
          <h1>Ideas move faster when the page is shared.</h1>
          <p>
            A focused writing space with live collaboration, reliable history,
            and no clutter between you and the next sentence.
          </p>
        </div>
        <div className="story-card" aria-hidden="true">
          <div className="story-card-top"><span /><span /><span /></div>
          <div className="story-line long" />
          <div className="story-line medium" />
          <div className="story-line short" />
          <div className="story-cursors"><span>AR</span><span>JM</span></div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-theme"><ThemeButton theme={theme} onClick={onToggleTheme} /></div>
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-heading">
            <p className="eyebrow">Welcome</p>
            <h2>{mode === 'login' ? 'Sign in to your workspace' : 'Create your workspace'}</h2>
            <p>{mode === 'login' ? 'Pick up where your team left off.' : 'Your first shared page is a moment away.'}</p>
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}

          {mode === 'register' && (
            <label>
              Display name
              <input
                autoComplete="name"
                value={displayName}
                minLength={2}
                required
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Avery Rivera"
              />
            </label>
          )}
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              value={email}
              required
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              minLength={8}
              required
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </label>

          <button className="button button-primary auth-submit" type="submit" disabled={submitting}>
            {submitting ? <><span className="spinner" /> Please wait</> : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <p className="auth-switch">
            {mode === 'login' ? 'New to Collab?' : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode((current) => (current === 'login' ? 'register' : 'login'))
                setError(null)
              }}
            >
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </form>
      </section>
    </main>
  )
}

function LoadingScreen({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  return (
    <main className="loading-screen">
      <div className="loading-theme"><ThemeButton theme={theme} onClick={onToggleTheme} /></div>
      <span className="brand-mark">C</span>
      <span className="spinner spinner-dark" />
      <p>Opening your workspace…</p>
    </main>
  )
}

function EmptyWorkspace({
  loading,
  creating,
  onCreate,
}: {
  loading: boolean
  creating: boolean
  onCreate: () => void
}) {
  return (
    <div className="empty-workspace">
      {loading ? (
        <><span className="spinner spinner-dark" /><p>Loading documents…</p></>
      ) : (
        <>
          <span className="empty-glyph" aria-hidden="true">✦</span>
          <h1>A fresh page is waiting.</h1>
          <p>Create a document and invite the first idea in.</p>
          <button className="button button-primary" type="button" disabled={creating} onClick={onCreate}>
            + New document
          </button>
        </>
      )}
    </div>
  )
}

function ThemeButton({ theme, onClick }: { theme: Theme; onClick: () => void }) {
  return (
    <button
      className="icon-button theme-button"
      type="button"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      onClick={onClick}
    >
      {theme === 'light' ? '☾' : '☀'}
    </button>
  )
}

function DocumentListSkeleton() {
  return (
    <div className="document-skeleton" aria-label="Loading documents">
      <span /><span /><span />
    </div>
  )
}

function createEditOperation(previous: string, next: string): EditOperation | null {
  if (previous === next) {
    return null
  }

  let start = 0
  const sharedLength = Math.min(previous.length, next.length)

  while (start < sharedLength && previous[start] === next[start]) {
    start += 1
  }

  let previousEnd = previous.length
  let nextEnd = next.length

  while (
    previousEnd > start &&
    nextEnd > start &&
    previous[previousEnd - 1] === next[nextEnd - 1]
  ) {
    previousEnd -= 1
    nextEnd -= 1
  }

  return {
    index: start,
    deleteCount: previousEnd - start,
    insertText: next.slice(start, nextEnd),
  }
}

function applyOperation(content: string, operation: EditOperation): string {
  if (
    operation.index < 0 ||
    operation.index > content.length ||
    operation.deleteCount < 0 ||
    operation.deleteCount > content.length - operation.index
  ) {
    throw new Error('Edit operation is outside the current document.')
  }

  return (
    content.slice(0, operation.index) +
    operation.insertText +
    content.slice(operation.index + operation.deleteCount)
  )
}

function replaceDocument(
  setDocuments: React.Dispatch<React.SetStateAction<DocumentRecord[]>>,
  nextDocument: DocumentRecord,
) {
  setDocuments((current) =>
    current.map((document) =>
      document.id === nextDocument.id ? nextDocument : document,
    ),
  )
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)

  if (stored === 'light' || stored === 'dark') {
    return stored
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'
}

function countWords(content: string): number {
  const text = plainTextContent(content).trim()
  return text ? text.split(/\s+/).length : 0
}

function plainTextLength(content: string): number {
  return plainTextContent(content).length
}

function plainTextContent(content: string): string {
  const element = document.createElement('div')
  element.innerHTML = content
  return element.textContent || ''
}

function sanitizeRichText(content: string): string {
  const template = document.createElement('template')
  template.innerHTML = content
  const allowedTags = new Set([
    'B',
    'BLOCKQUOTE',
    'BR',
    'DIV',
    'EM',
    'H1',
    'H2',
    'I',
    'LI',
    'OL',
    'P',
    'STRONG',
    'U',
    'UL',
  ])

  for (const element of Array.from(template.content.querySelectorAll('*'))) {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes))
      continue
    }

    const alignment = element.getAttribute('style')?.match(
      /text-align\s*:\s*(left|center|right|justify)/i,
    )?.[1]

    for (const attribute of Array.from(element.attributes)) {
      element.removeAttribute(attribute.name)
    }

    if (alignment) {
      element.setAttribute('style', `text-align: ${alignment.toLowerCase()}`)
    }
  }

  return template.innerHTML
}

function formatRelativeDate(value: string): string {
  const timestamp = new Date(value).getTime()
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000))

  if (!Number.isFinite(timestamp)) return 'Recently edited'
  if (elapsedMinutes < 1) return 'Edited just now'
  if (elapsedMinutes < 60) return `Edited ${elapsedMinutes}m ago`

  const elapsedHours = Math.round(elapsedMinutes / 60)
  if (elapsedHours < 24) return `Edited ${elapsedHours}h ago`

  const elapsedDays = Math.round(elapsedHours / 24)
  if (elapsedDays < 7) return `Edited ${elapsedDays}d ago`

  return `Edited ${new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

export default App
