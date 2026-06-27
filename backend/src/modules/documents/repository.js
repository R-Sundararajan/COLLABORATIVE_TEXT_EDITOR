const { pool } = require("../../config/postgres");

class DocumentNotFoundError extends Error {
  constructor(documentId) {
    super(`Document ${documentId} was not found.`);
    this.name = "DocumentNotFoundError";
  }
}

class DocumentPermissionError extends Error {
  constructor() {
    super("You do not have permission to modify this document.");
    this.name = "DocumentPermissionError";
  }
}

const WRITE_ROLES = new Set(["owner", "editor"]);
const OWNER_ROLES = new Set(["owner"]);

async function createDocument({ ownerUserId, title, content, metadata }) {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const { rows } = await client.query(
      `
        insert into documents (owner_user_id, title, content, metadata)
        values ($1, $2, $3, $4::jsonb)
        returning id
      `,
      [ownerUserId, title, content, JSON.stringify(metadata)],
    );
    const documentId = rows[0].id;
    const statistics = calculateDocumentStatistics(content);

    await client.query(
      `
        insert into document_permissions (document_id, user_id, role, granted_by_user_id)
        values ($1, $2, 'owner', $2)
      `,
      [documentId, ownerUserId],
    );

    await client.query(
      `
        insert into document_metadata (
          document_id,
          character_count,
          word_count,
          last_edited_by_user_id,
          last_edited_at
        )
        values ($1, $2, $3, $4, now())
      `,
      [
        documentId,
        statistics.characterCount,
        statistics.wordCount,
        ownerUserId,
      ],
    );

    const document = await selectDocumentForUser(client, documentId, ownerUserId);

    await client.query("commit");
    return document;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function listDocumentsForUser(userId) {
  const { rows } = await pool.query(
    `
      select ${DOCUMENT_SELECT_COLUMNS}
      from documents d
      inner join document_permissions dp
        on dp.document_id = d.id
        and dp.user_id = $1
      left join document_metadata dm
        on dm.document_id = d.id
      where d.archived_at is null
      order by d.updated_at desc, d.created_at desc
    `,
    [userId],
  );

  return rows.map(mapDocument);
}

async function findDocumentForUser(documentId, userId) {
  const client = await pool.connect();

  try {
    return await selectDocumentForUser(client, documentId, userId);
  } finally {
    client.release();
  }
}

async function updateDocument({ documentId, userId, changes }) {
  const client = await pool.connect();

  try {
    await client.query("begin");
    await assertDocumentRole(client, documentId, userId, WRITE_ROLES);

    const update = buildDocumentUpdate(documentId, changes);

    if (update.assignments.length > 0) {
      await client.query(
        `
          update documents
          set ${update.assignments.join(", ")}
          where id = $1
        `,
        update.values,
      );
    }

    if (typeof changes.content === "string") {
      await upsertDocumentStatistics(client, {
        documentId,
        userId,
        content: changes.content,
      });
    }

    const document = await selectDocumentForUser(client, documentId, userId);

    await client.query("commit");
    return document;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function saveDocument({ documentId, userId, content }) {
  return updateDocument({
    documentId,
    userId,
    changes: { content },
  });
}

async function writeDocumentState({
  documentId,
  content,
  revision,
  lastEditedByUserId = null,
}) {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const { rows } = await client.query(
      `
        select content, version, archived_at
        from documents
        where id = $1
        for update
      `,
      [documentId],
    );

    if (rows.length === 0 || rows[0].archived_at) {
      throw new DocumentNotFoundError(documentId);
    }

    const storedRevision = Number(rows[0].version);

    if (storedRevision > revision) {
      await client.query("commit");
      return {
        status: "stale",
        revision: storedRevision,
      };
    }

    if (storedRevision === revision && rows[0].content === content) {
      await client.query("commit");
      return {
        status: "unchanged",
        revision: storedRevision,
      };
    }

    await client.query(
      `
        update documents
        set content = $2,
            version = $3
        where id = $1
      `,
      [documentId, content, revision],
    );
    await upsertDocumentStatistics(client, {
      documentId,
      userId: lastEditedByUserId,
      content,
    });
    await client.query("commit");

    return {
      status: "updated",
      revision,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteDocument({ documentId, userId }) {
  const client = await pool.connect();

  try {
    await client.query("begin");
    await assertDocumentRole(client, documentId, userId, OWNER_ROLES);
    await client.query(
      `
        update documents
        set archived_at = now(),
            version = version + 1
        where id = $1
          and archived_at is null
      `,
      [documentId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function buildDocumentUpdate(documentId, changes) {
  const assignments = [];
  const values = [documentId];

  if (typeof changes.title === "string") {
    values.push(changes.title);
    assignments.push(`title = $${values.length}`);
  }

  if (typeof changes.content === "string") {
    values.push(changes.content);
    assignments.push(`content = $${values.length}`);
    assignments.push("version = version + 1");
  }

  if (typeof changes.metadata !== "undefined") {
    values.push(JSON.stringify(changes.metadata));
    assignments.push(`metadata = $${values.length}::jsonb`);
  }

  return {
    assignments,
    values,
  };
}

async function assertDocumentRole(client, documentId, userId, allowedRoles) {
  const access = await getDocumentAccess(client, documentId, userId);

  if (!access) {
    throw new DocumentNotFoundError(documentId);
  }

  if (!access.permissionRole) {
    throw new DocumentNotFoundError(documentId);
  }

  if (!allowedRoles.has(access.permissionRole)) {
    throw new DocumentPermissionError();
  }
}

async function getDocumentAccess(client, documentId, userId) {
  const { rows } = await client.query(
    `
      select
        d.id,
        d.owner_user_id,
        d.archived_at,
        dp.role as permission_role
      from documents d
      left join document_permissions dp
        on dp.document_id = d.id
        and dp.user_id = $2
      where d.id = $1
      limit 1
    `,
    [documentId, userId],
  );

  if (rows.length === 0 || rows[0].archived_at) {
    return null;
  }

  const permissionRole =
    rows[0].permission_role ||
    (rows[0].owner_user_id === userId ? "owner" : null);

  return {
    permissionRole,
  };
}

async function selectDocumentForUser(client, documentId, userId) {
  const { rows } = await client.query(
    `
      select ${DOCUMENT_SELECT_COLUMNS}
      from documents d
      inner join document_permissions dp
        on dp.document_id = d.id
        and dp.user_id = $2
      left join document_metadata dm
        on dm.document_id = d.id
      where d.id = $1
        and d.archived_at is null
      limit 1
    `,
    [documentId, userId],
  );

  return rows.length > 0 ? mapDocument(rows[0]) : null;
}

async function upsertDocumentStatistics(client, { documentId, userId, content }) {
  const statistics = calculateDocumentStatistics(content);

  await client.query(
    `
      insert into document_metadata (
        document_id,
        character_count,
        word_count,
        last_edited_by_user_id,
        last_edited_at
      )
      values ($1, $2, $3, $4, now())
      on conflict (document_id)
      do update set
        character_count = excluded.character_count,
        word_count = excluded.word_count,
        last_edited_by_user_id = excluded.last_edited_by_user_id,
        last_edited_at = excluded.last_edited_at
    `,
    [documentId, statistics.characterCount, statistics.wordCount, userId],
  );
}

function calculateDocumentStatistics(content) {
  const normalizedContent = typeof content === "string" ? content : "";
  const words = normalizedContent.trim().split(/\s+/).filter(Boolean);

  return {
    characterCount: normalizedContent.length,
    wordCount: words.length,
  };
}

function mapDocument(row) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    content: row.content,
    version: Number(row.version),
    metadata: row.metadata || {},
    permissionRole: row.permission_role,
    statistics: {
      characterCount: Number(row.character_count || 0),
      wordCount: Number(row.word_count || 0),
      lastEditedByUserId: row.last_edited_by_user_id,
      lastEditedAt: row.last_edited_at,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const DOCUMENT_SELECT_COLUMNS = `
  d.id,
  d.owner_user_id,
  d.title,
  d.content,
  d.version,
  d.metadata,
  d.created_at,
  d.updated_at,
  dp.role as permission_role,
  dm.character_count,
  dm.word_count,
  dm.last_edited_by_user_id,
  dm.last_edited_at
`;

module.exports = {
  DocumentNotFoundError,
  DocumentPermissionError,
  createDocument,
  deleteDocument,
  findDocumentForUser,
  listDocumentsForUser,
  saveDocument,
  updateDocument,
  writeDocumentState,
};
