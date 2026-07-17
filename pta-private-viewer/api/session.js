const documentsStoreModule = require("../lib/documents-store.cjs");
const documentsModule = require("../lib/documents.cjs");
const authModule = require("../lib/auth.cjs");
const httpUtilsModule = require("../lib/http-utils.cjs");
const { getReadyDocumentById, validateDocumentPin } = documentsStoreModule.default || documentsStoreModule;
const { getAvailability } = documentsModule.default || documentsModule;
const {
  createViewerSessionToken,
  buildViewerSessionCookie
} = authModule.default || authModule;
const { handleBlobStoreUnavailable, readJsonBody, sendJson } = httpUtilsModule.default || httpUtilsModule;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, message: "POST only" }, { Allow: "POST" });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, message: "JSON の形式が正しくありません。" });
    return;
  }

  try {
    const docId = typeof body.docId === "string" ? body.docId.trim() : "";
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";
    const doc = await getReadyDocumentById(docId);

    if (!doc) {
      sendJson(res, 404, { ok: false, message: "資料が見つかりません。" });
      return;
    }

    const availability = getAvailability(doc);
    if (availability.status !== "live") {
      sendJson(res, 403, {
        ok: false,
        message: `この資料は現在「${availability.label}」です。`
      });
      return;
    }

    const isValid = await validateDocumentPin(docId, pin);
    if (!isValid) {
      sendJson(res, 401, { ok: false, message: "PINコードが正しくありません。" });
      return;
    }

    const now = new Date();
    const sessionHours = 6;
    const requestedEnd = new Date(now.getTime() + sessionHours * 60 * 60 * 1000);
    const documentEnd = new Date(doc.endAt);
    const expiresAt = (requestedEnd < documentEnd ? requestedEnd : documentEnd).toISOString();
    const token = createViewerSessionToken(doc.id, expiresAt);

    sendJson(
      res,
      200,
      { ok: true, docId: doc.id, expiresAt, message: "閲覧セッションを開始しました。" },
      { "Set-Cookie": buildViewerSessionCookie(token, expiresAt) }
    );
  } catch (error) {
    if (handleBlobStoreUnavailable(res, error)) {
      return;
    }
    throw error;
  }
};
