/**
 * Coalesces accepted realtime document states before PostgreSQL persistence.
 * Maintains one serial flush per document, retries failed latest state, and
 * exposes explicit inactive-room and shutdown draining operations.
 */
const { env } = require("../../config/env");
const { writeDocumentState } = require("./repository");

class DocumentStatePersistence {
  constructor({
    persist = writeDocumentState,
    debounceMs = env.DOCUMENT_PERSIST_DEBOUNCE_MS,
    retryMs = env.DOCUMENT_PERSIST_RETRY_MS,
    logger = console,
  } = {}) {
    if (typeof persist !== "function") {
      throw new TypeError("A document state persistence function is required.");
    }

    if (!Number.isSafeInteger(debounceMs) || debounceMs < 1) {
      throw new TypeError("Persistence debounce must be a positive integer.");
    }

    if (!Number.isSafeInteger(retryMs) || retryMs < 1) {
      throw new TypeError("Persistence retry delay must be a positive integer.");
    }

    this.persist = persist;
    this.debounceMs = debounceMs;
    this.retryMs = retryMs;
    this.logger = logger;
    this.records = new Map();
    this.closed = false;
  }

  schedule(state) {
    const normalizedState = normalizeDocumentState(state);

    if (this.closed) {
      throw new Error("Document state persistence is closed.");
    }

    const record = this.getOrCreateRecord(normalizedState.documentId);

    if (record.latestRevision > normalizedState.revision) {
      return;
    }

    // Replacing pending state bounds rapid edits to the newest full snapshot.
    record.latestRevision = normalizedState.revision;
    record.pending = normalizedState;

    if (!record.timer && !record.flushPromise) {
      this.setFlushTimer(record, this.debounceMs);
    }
  }

  async synchronize(state) {
    this.schedule(state);
    return this.flush(state.documentId);
  }

  async flush(documentId) {
    const record = this.records.get(documentId);

    if (!record) {
      return null;
    }

    this.clearFlushTimer(record);

    if (record.flushPromise) {
      try {
        await record.flushPromise;
      } catch {
        // The failed state remains pending and the next drain retries it.
      }

      this.clearFlushTimer(record);

      if (!record.pending) {
        return null;
      }
    }

    // A single in-flight drain owns the document; later states remain pending.
    record.flushPromise = this.drain(record).finally(() => {
      record.flushPromise = null;

      if (record.pending && !record.timer && !this.closed) {
        this.setFlushTimer(record, this.retryMs);
      } else if (!record.pending && !record.timer) {
        this.records.delete(documentId);
      }
    });

    return record.flushPromise;
  }

  async flushAll() {
    const documentIds = [...this.records.keys()];

    return Promise.allSettled(
      documentIds.map((documentId) => this.flush(documentId)),
    );
  }

  async close() {
    this.closed = true;

    for (const record of this.records.values()) {
      this.clearFlushTimer(record);
    }

    const results = await this.flushAll();

    for (const result of results) {
      if (result.status === "rejected") {
        this.logger.error?.(
          "Unable to flush document state during shutdown:",
          result.reason,
        );
      }
    }

    return results;
  }

  getOrCreateRecord(documentId) {
    let record = this.records.get(documentId);

    if (!record) {
      record = {
        documentId,
        pending: null,
        timer: null,
        flushPromise: null,
        latestRevision: -1,
      };
      this.records.set(documentId, record);
    }

    return record;
  }

  setFlushTimer(record, delayMs) {
    record.timer = setTimeout(() => {
      record.timer = null;
      this.flush(record.documentId).catch((error) => {
        this.logger.warn?.(
          `Unable to persist document state for ${record.documentId}:`,
          error.message,
        );
      });
    }, delayMs);
    record.timer.unref?.();
  }

  clearFlushTimer(record) {
    if (record.timer) {
      clearTimeout(record.timer);
      record.timer = null;
    }
  }

  async drain(record) {
    let result = null;

    while (record.pending) {
      const state = record.pending;
      record.pending = null;

      try {
        result = await this.persist(state);
      } catch (error) {
        // Preserve the failed snapshot unless a newer revision arrived mid-write.
        if (!record.pending || record.pending.revision <= state.revision) {
          record.pending = state;
        }

        throw error;
      }
    }

    return result;
  }
}

function normalizeDocumentState(state) {
  if (
    !state ||
    typeof state.documentId !== "string" ||
    state.documentId.length === 0 ||
    typeof state.content !== "string" ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0 ||
    !(
      state.lastEditedByUserId === null ||
      typeof state.lastEditedByUserId === "string"
    )
  ) {
    throw new TypeError(
      "Persistent document state requires an id, content, revision, and optional editor id.",
    );
  }

  return {
    documentId: state.documentId,
    content: state.content,
    revision: state.revision,
    lastEditedByUserId: state.lastEditedByUserId || null,
  };
}

module.exports = { DocumentStatePersistence };
