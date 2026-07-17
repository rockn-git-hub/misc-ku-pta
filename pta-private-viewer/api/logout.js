const authModule = require("../lib/auth.cjs");
const httpUtilsModule = require("../lib/http-utils.cjs");
const { VIEWER_COOKIE_NAME, buildExpiredCookie } = authModule.default || authModule;
const { sendJson } = httpUtilsModule.default || httpUtilsModule;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, message: "POST only" }, { Allow: "POST" });
    return;
  }

  sendJson(
    res,
    200,
    { ok: true, message: "閲覧セッションを終了しました。" },
    { "Set-Cookie": buildExpiredCookie(VIEWER_COOKIE_NAME) }
  );
};
