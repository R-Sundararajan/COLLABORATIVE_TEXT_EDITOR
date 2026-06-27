/**
 * Defines the authenticated document, sharing, and membership HTTP routes.
 * Validates transport inputs, invokes repository operations, and maps
 * document validation/access/share errors to stable HTTP responses.
 */
const express = require("express");

const { requireAuth } = require("../auth/middleware");
const {
  DocumentNotFoundError,
  DocumentPermissionError,
  DocumentShareError,
  createDocument,
  createDocumentShareLink,
  deleteDocument,
  findDocumentForUser,
  joinSharedDocument,
  listDocumentsForUser,
  listDocumentMembers,
  saveDocument,
  shareDocumentWithUser,
  updateDocument,
} = require("./repository");
const {
  DocumentValidationError,
  parseCreateDocumentRequest,
  parseCreateShareLinkRequest,
  parseDocumentId,
  parseJoinDocumentRequest,
  parseSaveDocumentRequest,
  parseShareDocumentRequest,
  parseUpdateDocumentRequest,
} = require("./validation");

function createDocumentsRouter() {
  const router = express.Router();

  router.use(requireAuth);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const documents = await listDocumentsForUser(req.auth.user.id);

      res.json({ documents });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const input = parseCreateDocumentRequest(req.body);
      const document = await createDocument({
        ownerUserId: req.auth.user.id,
        ...input,
      });

      res.status(201).json({ document });
    }),
  );

  router.post(
    "/join",
    asyncHandler(async (req, res) => {
      const { code } = parseJoinDocumentRequest(req.body);
      const document = await joinSharedDocument({
        code,
        userId: req.auth.user.id,
      });

      res.json({ document });
    }),
  );

  router.get(
    "/:documentId/members",
    asyncHandler(async (req, res) => {
      const documentId = parseDocumentId(req.params.documentId);
      const members = await listDocumentMembers({
        documentId,
        userId: req.auth.user.id,
      });

      res.json({ members });
    }),
  );

  router.post(
    "/:documentId/share",
    asyncHandler(async (req, res) => {
      const documentId = parseDocumentId(req.params.documentId);
      const input = parseShareDocumentRequest(req.body);
      const member = await shareDocumentWithUser({
        documentId,
        userId: req.auth.user.id,
        ...input,
      });

      res.json({ member });
    }),
  );

  router.post(
    "/:documentId/share-link",
    asyncHandler(async (req, res) => {
      const documentId = parseDocumentId(req.params.documentId);
      const { role } = parseCreateShareLinkRequest(req.body);
      const shareLink = await createDocumentShareLink({
        documentId,
        userId: req.auth.user.id,
        role,
      });

      res.json({ shareLink });
    }),
  );

  router.get(
    "/:documentId",
    asyncHandler(async (req, res) => {
      const documentId = parseDocumentId(req.params.documentId);
      const document = await findDocumentForUser(documentId, req.auth.user.id);

      if (!document) {
        throw new DocumentNotFoundError(documentId);
      }

      res.json({ document });
    }),
  );

  router.patch(
    "/:documentId",
    asyncHandler(async (req, res) => {
      const documentId = parseDocumentId(req.params.documentId);
      const changes = parseUpdateDocumentRequest(req.body);
      const document = await updateDocument({
        documentId,
        userId: req.auth.user.id,
        changes,
      });

      res.json({ document });
    }),
  );

  router.put(
    "/:documentId/save",
    asyncHandler(async (req, res) => {
      const documentId = parseDocumentId(req.params.documentId);
      const input = parseSaveDocumentRequest(req.body);
      const document = await saveDocument({
        documentId,
        userId: req.auth.user.id,
        content: input.content,
      });

      res.json({ document });
    }),
  );

  router.delete(
    "/:documentId",
    asyncHandler(async (req, res) => {
      const documentId = parseDocumentId(req.params.documentId);

      await deleteDocument({
        documentId,
        userId: req.auth.user.id,
      });

      res.status(204).send();
    }),
  );

  router.use(handleDocumentError);

  return router;
}

function asyncHandler(routeHandler) {
  return (req, res, next) => {
    Promise.resolve(routeHandler(req, res, next)).catch(next);
  };
}

function handleDocumentError(error, _req, res, next) {
  if (error instanceof DocumentValidationError) {
    return res.status(400).json({
      message: error.message,
      details: error.details,
    });
  }

  if (error instanceof DocumentNotFoundError) {
    return res.status(404).json({
      message: "Document not found.",
    });
  }

  if (error instanceof DocumentPermissionError) {
    return res.status(403).json({
      message: error.message,
    });
  }

  if (error instanceof DocumentShareError) {
    return res.status(error.statusCode).json({
      message: error.message,
    });
  }

  return next(error);
}

module.exports = {
  createDocumentsRouter,
};
