import './App.css'

function App() {
  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="brand">
          <span className="brand-mark">CT</span>
          <span>Collab Text</span>
        </div>

        <nav className="nav-list">
          <a className="nav-item active" href="#documents">
            Documents
          </a>
          <a className="nav-item" href="#shared">
            Shared
          </a>
          <a className="nav-item" href="#activity">
            Activity
          </a>
        </nav>

        <section className="document-list" aria-label="Recent documents">
          <p className="eyebrow">Recent</p>
          <a className="document-item selected" href="#draft">
            <span>Product notes</span>
            <small>Draft</small>
          </a>
          <a className="document-item" href="#planning">
            <span>Launch plan</span>
            <small>Outline</small>
          </a>
        </section>
      </aside>

      <section className="workspace" aria-label="Document workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>Product notes</h1>
          </div>
          <div className="service-status" aria-label="Service status">
            <span className="status-dot" />
            Phase 1
          </div>
        </header>

        <div className="editor-layout">
          <section className="editor-panel" aria-label="Document editor">
            <div className="editor-toolbar">
              <span>Untitled draft</span>
              <span>Ready</span>
            </div>
            <textarea
              aria-label="Document body"
              readOnly
              value={`Collaborative editor workspace\n\nThis surface is ready for document CRUD, live collaboration, conflict resolution, Redis caching, and PostgreSQL persistence in the upcoming phases.`}
            />
          </section>

          <aside className="metadata-panel" aria-label="Document metadata">
            <section>
              <p className="eyebrow">Session</p>
              <div className="metadata-row">
                <span>Editors</span>
                <strong>1</strong>
              </div>
              <div className="metadata-row">
                <span>Transport</span>
                <strong>Idle</strong>
              </div>
            </section>

            <section>
              <p className="eyebrow">Storage</p>
              <div className="metadata-row">
                <span>Cache</span>
                <strong>Redis</strong>
              </div>
              <div className="metadata-row">
                <span>Store</span>
                <strong>Postgres</strong>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  )
}

export default App
