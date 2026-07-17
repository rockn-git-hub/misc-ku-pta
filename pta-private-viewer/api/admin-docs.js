const documentsStoreModule = require("../lib/documents-store.cjs");
const authModule = require("../lib/auth.cjs");
const httpUtilsModule = require("../lib/http-utils.cjs");
const { getAdminDocuments } = documentsStoreModule.default || documentsStoreModule;
const {
  ADMIN_COOKIE_NAME,
  parseCookies,
  verifyAdminSessionToken
} = authModule.default || authModule;
const { handleBlobStoreUnavailable, sendJson } = httpUtilsModule.default || httpUtilsModule;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, message: "GET only" }, { Allow: "GET" });
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const session = verifyAdminSessionToken(cookies[ADMIN_COOKIE_NAME]);
  if (!session.valid) {
    sendJson(res, 401, { ok: false, message: "管理者ログインが必要です。" });
    return;
  }

  try {
    sendJson(res, 200, { ok: true, documents: await getAdminDocuments() });
  } catch (error) {
    if (handleBlobStoreUnavailable(res, error)) {
      return;
    }
    throw error;
  }
};
