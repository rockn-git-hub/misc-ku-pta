const documentsModule = require("../lib/documents.cjs");
const documentsStoreModule = require("../lib/documents-store.cjs");
const storageModule = require("../lib/storage.cjs");
const authModule = require("../lib/auth.cjs");
const httpUtilsModule = require("../lib/http-utils.cjs");
const { buildViewerPath, getAvailability } = documentsModule.default || documentsModule;
const { getReadyDocumentById } = documentsStoreModule.default || documentsStoreModule;
const storage = storageModule.default || storageModule;
const {
  VIEWER_COOKIE_NAME,
  parseCookies,
  verifyViewerSessionToken,
  buildExpiredCookie
} = authModule.default || authModule;
const { handleBlobStoreUnavailable, sendJson } = httpUtilsModule.default || httpUtilsModule;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, message: "GET only" }, { Allow: "GET" });
    return;
  }

  try {
    const url = new URL(req.url, "http://localhost");
    const docId = url.searchParams.get("doc") || "";
    const doc = await getReadyDocumentById(docId);

    if (!doc) {
      sendJson(res, 404, { ok: false, message: "資料が見つかりません。" });
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const session = verifyViewerSessionToken(cookies[VIEWER_COOKIE_NAME]);
    if (!session.valid || session.docId !== doc.id) {
      sendJson(res, 401, { ok: false, message: "PINコードの入力が必要です。" });
      return;
    }

    const availability = getAvailability(doc);
    if (availability.status !== "live") {
      sendJson(
        res,
        403,
        { ok: false, message: `この資料は現在「${availability.label}」です。` },
        { "Set-Cookie": buildExpiredCookie(VIEWER_COOKIE_NAME) }
      );
      return;
    }

    sendJson(res, 200, {
      ok: true,
      document: {
        id: doc.id,
        title: doc.title,
        description: doc.description,
        startAt: doc.startAt,
        endAt: doc.endAt,
        expiresAt: session.expiresAt,
        viewerUrl: buildViewerPath(doc.id),
        pages: doc.pages.map((page) => ({
          pageNumber: page.pageNumber,
          imageUrl: storage.isCloudFrontSigningEnabled() ? null : (page.publicUrl || `/api/page?doc=${encodeURIComponent(doc.id)}&page=${page.pageNumber}`),
          imageUrlEndpoint: `/api/page-url?doc=${encodeURIComponent(doc.id)}&page=${page.pageNumber}`
        }))
      }
    });
  } catch (error) {
    if (handleBlobStoreUnavailable(res, error)) {
      return;
    }
    throw error;
  }
};
