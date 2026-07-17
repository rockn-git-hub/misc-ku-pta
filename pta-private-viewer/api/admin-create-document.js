const documentsStoreModule = require("../lib/documents-store.cjs");
const authModule = require("../lib/auth.cjs");
const httpUtilsModule = require("../lib/http-utils.cjs");
const { createDraftDocument } = documentsStoreModule.default || documentsStoreModule;
const {
  ADMIN_COOKIE_NAME,
  parseCookies,
  verifyAdminSessionToken
} = authModule.default || authModule;
const { handleBlobStoreUnavailable, readJsonBody, sendJson } = httpUtilsModule.default || httpUtilsModule;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, message: "POST only" }, { Allow: "POST" });
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const session = verifyAdminSessionToken(cookies[ADMIN_COOKIE_NAME]);
  if (!session.valid) {
    sendJson(res, 401, { ok: false, message: "管理者ログインが必要です。" });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, message: "JSON の形式が正しくありません。" });
    return;
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const sourceFileName = typeof body.sourceFileName === "string" ? body.sourceFileName.trim() : "";
  const pageCount = Number.parseInt(String(body.pageCount || ""), 10);
  const startAt = typeof body.startAt === "string" ? body.startAt : "";
  const endAt = typeof body.endAt === "string" ? body.endAt : "";

  if (!title) {
    sendJson(res, 400, { ok: false, message: "タイトルを入力してください。" });
    return;
  }
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    sendJson(res, 400, { ok: false, message: "ページ数が正しくありません。" });
    return;
  }
  if (Number.isNaN(new Date(startAt).valueOf()) || Number.isNaN(new Date(endAt).valueOf())) {
    sendJson(res, 400, { ok: false, message: "公開日時が正しくありません。" });
    return;
  }
  if (new Date(startAt) >= new Date(endAt)) {
    sendJson(res, 400, { ok: false, message: "公開開始は公開終了より前にしてください。" });
    return;
  }

  try {
    const draft = await createDraftDocument({
      title,
      description,
      startAt,
      endAt,
      pageCount,
      sourceFileName
    });

    sendJson(res, 200, {
      ok: true,
      docId: draft.docId,
      pin: draft.pin,
      viewerPath: draft.viewerPath
    });
  } catch (error) {
    if (handleBlobStoreUnavailable(res, error)) {
      return;
    }
    throw error;
  }
};
