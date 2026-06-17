const authModule = require("../lib/auth.cjs");
const httpUtilsModule = require("../lib/http-utils.cjs");
const {
  ADMIN_COOKIE_NAME,
  getAdminPassword,
  parseCookies,
  createAdminSessionToken,
  verifyAdminSessionToken,
  buildAdminSessionCookie,
  buildExpiredCookie
} = authModule.default || authModule;
const { readJsonBody, sendJson } = httpUtilsModule.default || httpUtilsModule;

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const cookies = parseCookies(req.headers.cookie);
    const session = verifyAdminSessionToken(cookies[ADMIN_COOKIE_NAME]);
    sendJson(res, 200, { ok: true, authenticated: session.valid });
    return;
  }

  if (req.method === "DELETE") {
    sendJson(
      res,
      200,
      { ok: true, message: "管理者セッションを終了しました。" },
      { "Set-Cookie": buildExpiredCookie(ADMIN_COOKIE_NAME) }
    );
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, message: "GET, POST or DELETE only" }, { Allow: "GET, POST, DELETE" });
    return;
  }

  const adminPassword = getAdminPassword();
  if (!adminPassword) {
    sendJson(res, 500, { ok: false, message: "ADMIN_PASSWORD が未設定です。" });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, message: "JSONの形式が正しくありません。" });
    return;
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password !== adminPassword) {
    sendJson(res, 401, { ok: false, message: "管理者パスワードが違います。" });
    return;
  }

  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const token = createAdminSessionToken(expiresAt);
  sendJson(
    res,
    200,
    { ok: true, authenticated: true },
    { "Set-Cookie": buildAdminSessionCookie(token, expiresAt) }
  );
};
