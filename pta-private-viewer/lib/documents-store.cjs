/**
 * Persistent document store backed by local files or Vercel Blob.
 */
const crypto = require("node:crypto");
const documentsModule = require("./documents.cjs");
const storageModule = require("./storage.cjs");
const { buildViewerPath, getAvailability } = documentsModule.default || documentsModule;
const storage = storageModule.default || storageModule;

const INDEX_PATH = "documents/index.json";
const DELETED_PREFIX = "documents/_deleted/";

function emptyIndex() {
  return { documents: [] };
}

function hashPin(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function verifyPin(pin, hash) {
  const actual = hashPin(pin);
  return actual.length === hash.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(hash));
}

async function readIndex() {
  return (await storage.readJson(INDEX_PATH, emptyIndex())) || emptyIndex();
}

async function writeIndex(index) {
  await storage.writeJson(INDEX_PATH, index);
}

function manifestPath(docId) {
  return `documents/${docId}/manifest.json`;
}

function publishedPath(docId) {
  return `documents/${docId}/published.json`;
}

function statePrefix(docId) {
  return `documents/${docId}/states/`;
}

function statePath(docId) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${statePrefix(docId)}${stamp}-${suffix}.json`;
}

function deletedPath(docId) {
  return `${DELETED_PREFIX}${docId}.json`;
}

function pagePath(docId, pageNumber) {
  return `documents/${docId}/pages/${String(pageNumber).padStart(3, "0")}.webp`;
}

function publicPagePath(docId, pageNumber) {
  return `documents/${docId}/public-pages/${String(pageNumber).padStart(3, "0")}.webp`;
}

function createPages(total, docId) {
  return Array.from({ length: total }, (_, index) => {
    const pageNumber = index + 1;
    return {
      pageNumber,
      label: `${pageNumber}ページ`,
      pathname: pagePath(docId, pageNumber),
      publicPathname: publicPagePath(docId, pageNumber),
      contentType: "image/webp",
      publicUrl: null
    };
  });
}

function createDocumentId() {
  return `doc-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomBytes(4).toString("hex")}`;
}

function createPin() {
  return String(crypto.randomInt(0, 10000)).padStart(4, "0");
}

async function getDocumentById(docId) {
  return storage.readJson(manifestPath(docId), null);
}

async function readLatestState(docId) {
  const pathnames = await storage.listPathnames(statePrefix(docId));
  if (!pathnames.length) {
    return null;
  }
  const latestPathname = pathnames[pathnames.length - 1];
  return storage.readJson(latestPathname, null);
}

async function mergeDocumentState(doc) {
  if (!doc) {
    return null;
  }

  const [state, deletedInfo] = await Promise.all([
    readLatestState(doc.id),
    storage.readJson(deletedPath(doc.id), null)
  ]);

  return {
    ...doc,
    ...(state || {}),
    deletedAt: deletedInfo?.deletedAt || null,
    pages: Array.isArray(doc.pages)
      ? doc.pages.map((page) => ({
          ...page,
          label: `${page.pageNumber}ページ`
        }))
      : []
  };
}

async function getReadyDocumentById(docId) {
  const doc = await mergeDocumentState(await getDocumentById(docId));
  if (!doc) {
    return null;
  }

  if (doc.deletedAt) {
    return null;
  }

  const isPublished = doc.ready === true || await storage.exists(publishedPath(docId));
  if (!isPublished) {
    return null;
  }

  return {
    ...doc,
    ready: true
  };
}

async function createDraftDocument(input) {
  const docId = createDocumentId();
  const pin = createPin();
  const createdAt = new Date().toISOString();

  const manifest = {
    id: docId,
    title: input.title,
    description: input.description || "",
    startAt: input.startAt,
    endAt: input.endAt,
    pageCount: input.pageCount,
    ready: false,
    createdAt,
    updatedAt: createdAt,
    sourceFileName: input.sourceFileName || null,
    manualVisibility: "public",
    pin,
    pinHash: hashPin(pin),
    pages: createPages(input.pageCount, docId)
  };

  await storage.writeJson(manifestPath(docId), manifest);

  return {
    docId,
    pin,
    viewerPath: buildViewerPath(docId)
  };
}

async function uploadDocumentPage(docId, pageNumber, buffer, contentType) {
  const manifest = await getDocumentById(docId);
  if (!manifest) {
    throw new Error("document-not-found");
  }
  const pageIndex = manifest.pages.findIndex((item) => item.pageNumber === pageNumber);
  const page = manifest.pages[pageIndex];
  if (!page) {
    throw new Error("page-not-found");
  }

  let stored;

  if (storage.isS3StorageEnabled()) {
    stored = await storage.writeBuffer(page.pathname, buffer, contentType, {
      access: "private"
    });
    manifest.pages[pageIndex] = {
      ...page,
      contentType: stored.contentType || contentType
    };
  } else {
    await storage.writeBuffer(page.pathname, buffer, contentType, {
      access: "private"
    });
    stored = await storage.writeBuffer(page.publicPathname || publicPagePath(docId, pageNumber), buffer, contentType, {
      access: "public"
    });

    manifest.pages[pageIndex] = {
      ...page,
      publicPathname: page.publicPathname || publicPagePath(docId, pageNumber),
      contentType: stored.contentType || contentType,
      publicUrl: stored.url || page.publicUrl || null
    };
  }

  manifest.updatedAt = new Date().toISOString();
  await storage.writeJson(manifestPath(docId), manifest);
}

async function finalizeDocument(docId) {
  const manifest = await getDocumentById(docId);
  if (!manifest) {
    throw new Error("document-not-found");
  }

  for (const page of manifest.pages) {
    const found = await storage.exists(page.pathname);
    if (!found) {
      throw new Error(`missing-page:${page.pageNumber}`);
    }
  }

  const publishedAt = new Date().toISOString();

  await storage.writeJson(publishedPath(docId), {
    docId,
    publishedAt
  });

  const index = await readIndex();
  const summary = {
    id: manifest.id,
    title: manifest.title,
    description: manifest.description,
    startAt: manifest.startAt,
    endAt: manifest.endAt,
    pageCount: manifest.pageCount,
    createdAt: manifest.createdAt,
    updatedAt: publishedAt,
    ready: true,
    sourceFileName: manifest.sourceFileName || null,
    manualVisibility: manifest.manualVisibility || "public",
    pin: manifest.pin || null
  };

  const nextDocuments = index.documents.filter((doc) => doc.id !== manifest.id);
  nextDocuments.unshift(summary);
  await writeIndex({ documents: nextDocuments });

  return {
    ...manifest,
    ready: true,
    updatedAt: publishedAt
  };
}

async function hydrateIndexedDocument(summary) {
  const manifest = await getDocumentById(summary.id);
  const source = manifest || summary;
  const merged = await mergeDocumentState({
    id: summary.id,
    title: source.title ?? summary.title,
    description: source.description ?? summary.description ?? "",
    startAt: source.startAt ?? summary.startAt,
    endAt: source.endAt ?? summary.endAt,
    pageCount: source.pageCount ?? summary.pageCount,
    createdAt: source.createdAt ?? summary.createdAt,
    updatedAt: summary.updatedAt ?? source.updatedAt,
    ready: summary.ready ?? source.ready ?? false,
    sourceFileName: source.sourceFileName ?? summary.sourceFileName ?? null,
    manualVisibility: source.manualVisibility ?? summary.manualVisibility ?? "public",
    pin: source.pin ?? summary.pin ?? null,
    pinHash: source.pinHash ?? summary.pinHash ?? null,
    pages: Array.isArray(source.pages) ? source.pages : []
  });

  if (!merged) {
    return null;
  }

  const isPublished = merged.ready === true || await storage.exists(publishedPath(summary.id));
  return {
    ...merged,
    ready: isPublished
  };
}

async function getPublicDocumentSummaries(now = new Date()) {
  const index = await readIndex();
  const hydratedDocuments = await Promise.all(
    index.documents
      .filter((doc) => doc.ready === true)
      .map((doc) => hydrateIndexedDocument(doc))
  );

  return hydratedDocuments
    .filter((doc) => doc && !doc.deletedAt && doc.manualVisibility !== "private")
    .map((doc) => {
      const availability = getAvailability(doc, now);
      return {
        id: doc.id,
        title: doc.title,
        description: doc.description,
        startAt: doc.startAt,
        endAt: doc.endAt,
        pageCount: doc.pageCount,
        status: availability.status,
        statusLabel: availability.label,
        viewerUrl: buildViewerPath(doc.id)
      };
    });
}

async function getAdminDocuments() {
  const index = await readIndex();
  const hydratedDocuments = await Promise.all(index.documents.map((doc) => hydrateIndexedDocument(doc)));

  return hydratedDocuments
    .filter((doc) => doc && !doc.deletedAt)
    .map((doc) => ({
      ...doc,
      viewerUrl: buildViewerPath(doc.id),
      status: getAvailability(doc).status,
      statusLabel: getAvailability(doc).label
    }));
}

async function validateDocumentPin(docId, pin) {
  const doc = await getReadyDocumentById(docId);
  if (!doc || !doc.pinHash) {
    return false;
  }
  return verifyPin(pin, doc.pinHash);
}

async function updateDocumentVisibility(docId, manualVisibility) {
  const doc = await getDocumentById(docId);
  if (!doc) {
    throw new Error("document-not-found");
  }

  const updatedAt = new Date().toISOString();
  await storage.writeJson(statePath(docId), {
    manualVisibility,
    updatedAt
  });

  return {
    ...(await mergeDocumentState(doc)),
    updatedAt
  };
}

async function reissueDocumentPin(docId) {
  const doc = await getDocumentById(docId);
  if (!doc) {
    throw new Error("document-not-found");
  }

  const pin = createPin();
  const updatedAt = new Date().toISOString();
  await storage.writeJson(statePath(docId), {
    pin,
    pinHash: hashPin(pin),
    updatedAt
  });

  return {
    pin,
    document: {
      ...(await mergeDocumentState(doc)),
      updatedAt
    }
  };
}

async function backfillDocumentPublicPageUrls(docId) {
  if (storage.isS3StorageEnabled()) {
    const doc = await getDocumentById(docId);
    if (!doc) {
      throw new Error("document-not-found");
    }

    return {
      docId,
      updatedPages: 0,
      document: doc
    };
  }

  const doc = await getDocumentById(docId);
  if (!doc) {
    throw new Error("document-not-found");
  }

  let updatedPages = 0;

  for (let index = 0; index < doc.pages.length; index += 1) {
    const page = doc.pages[index];
    if (page.publicUrl) {
      continue;
    }

    const file = await storage.readBuffer(page.pathname);
    if (!file || !file.buffer) {
      throw new Error(`missing-page:${page.pageNumber}`);
    }

    const stored = await storage.writeBuffer(page.pathname, file.buffer, file.contentType || page.contentType || "image/webp", {
      access: "private"
    });
    const publicStored = await storage.writeBuffer(page.publicPathname || publicPagePath(docId, page.pageNumber), file.buffer, file.contentType || page.contentType || "image/webp", {
      access: "public"
    });

    doc.pages[index] = {
      ...page,
      publicPathname: page.publicPathname || publicPagePath(docId, page.pageNumber),
      contentType: stored.contentType || page.contentType || "image/webp",
      publicUrl: publicStored.url || page.publicUrl || null
    };
    updatedPages += 1;
  }

  if (updatedPages > 0) {
    doc.updatedAt = new Date().toISOString();
    await storage.writeJson(manifestPath(docId), doc);
  }

  return {
    docId,
    updatedPages,
    document: doc
  };
}

async function deleteDocument(docId) {
  const doc = await getDocumentById(docId);
  if (!doc) {
    throw new Error("document-not-found");
  }

  const deletedAt = new Date().toISOString();
  await storage.writeJson(deletedPath(docId), { docId, deletedAt });

  const index = await readIndex();
  index.documents = index.documents.filter((item) => item.id !== docId);
  await writeIndex(index);

  await storage.deletePrefix(`documents/${docId}/`);
  return { docId, deletedAt };
}

module.exports = {
  getDocumentById,
  getReadyDocumentById,
  createDraftDocument,
  uploadDocumentPage,
  finalizeDocument,
  getPublicDocumentSummaries,
  getAdminDocuments,
  validateDocumentPin,
  updateDocumentVisibility,
  reissueDocumentPin,
  backfillDocumentPublicPageUrls,
  deleteDocument
};
