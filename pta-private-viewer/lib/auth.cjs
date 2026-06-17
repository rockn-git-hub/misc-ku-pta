/**
 * Minimal cookie-based authentication helper for viewer and admin sessions.
 */
const crypto = require("node:crypto");

const VIEWER_COOKIE_NAME = "pta_viewer_session";
const ADMIN_COOKIE_NAME = "pta_admin_session";

/**
 * Resolve the secret used to sign session tokens.
 * @returns {string}
 */
function getSecret() {
  return process.env.VIEWER_SECRET || "dev-secret-change-me";
}

/**
 * Resolve the admin password.
 * Production requires ADMIN_PASSWORD to be explicitly configured.
 * @returns {string|null}
 */
function getAdminPassword() {
  if (process.env.ADMIN_PASSWORD) {
    return process.env.ADMIN_PASSWORD;
  }
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  return "admin-demo";
}

/**
 * Parse the Cookie header into a key/value map.
 * @param {string|undefined} cookieHeader
 * @returns {Record<string, string>}
 */
function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const index = pair.indexOf("=");
      if (index < 0) {
        return acc;
      }
      const key = pair.slice(0, index);
      const value = pair.slice(index + 1);
      try {
        acc[key] = decodeURIComponent(value);
      } catch {
        acc[key] = value;
      }
      return acc;
    }, {});
}

/**
 * Build a signature for the payload.
 * @param {string} value
 * @returns {string}
 */
function sign(value) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("hex");
}

/**
 * Create a signed token.
 * @param {string} scope
 * @param {string} resource
 * @param {string} expiresAt
 * @returns {string}
 */
function createToken(scope, resource, expiresAt) {
  const payload = `${scope}|${resource}|${expiresAt}`;
  return `${payload}|${sign(payload)}`;
}

/**
 * Verify a signed token.
 * @param {string} token
 * @returns {{valid: boolean, scope?: string, resource?: string, expiresAt?: string}}
 */
function verifyToken(token) {
  if (!token) {
    return { valid: false };
  }

  const parts = token.split("|");
  if (parts.length !== 4) {
    return { valid: false };
  }

  const [scope, resource, expiresAt, signature] = parts;
  const payload = `${scope}|${resource}|${expiresAt}`;
  const expected = sign(payload);

  if (signature.length !== expected.length) {
    return { valid: false };
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { valid: false };
  }
  if (new Date(expiresAt) <= new Date()) {
    return { valid: false };
  }

  return { valid: true, scope, resource, expiresAt };
}

/**
 * Create a viewer session token for a document.
 * @param {string} docId
 * @param {string} expiresAt
 * @returns {string}
 */
function createViewerSessionToken(docId, expiresAt) {
  return createToken("viewer", docId, expiresAt);
}

/**
 * Verify a viewer session token.
 * @param {string} token
 * @returns {{valid: boolean, docId?: string, expiresAt?: string}}
 */
function verifyViewerSessionToken(token) {
  const result = verifyToken(token);
  if (!result.valid || result.scope !== "viewer") {
    return { valid: false };
  }
  return { valid: true, docId: result.resource, expiresAt: result.expiresAt };
}

/**
 * Create an admin session token.
 * @param {string} expiresAt
 * @returns {string}
 */
function createAdminSessionToken(expiresAt) {
  return createToken("admin", "dashboard", expiresAt);
}

/**
 * Verify an admin session token.
 * @param {string} token
 * @returns {{valid: boolean, expiresAt?: string}}
 */
function verifyAdminSessionToken(token) {
  const result = verifyToken(token);
  if (!result.valid || result.scope !== "admin") {
    return { valid: false };
  }
  return { valid: true, expiresAt: result.expiresAt };
}

/**
 * Create a Set-Cookie header for an active viewer session.
 * @param {string} token
 * @param {string} expiresAt
 * @returns {string}
 */
function buildViewerSessionCookie(token, expiresAt) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${VIEWER_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure}`;
}

/**
 * Create a Set-Cookie header for an active admin session.
 * @param {string} token
 * @param {string} expiresAt
 * @returns {string}
 */
function buildAdminSessionCookie(token, expiresAt) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure}`;
}

/**
 * Create an expired Set-Cookie header.
 * @param {string} cookieName
 * @returns {string}
 */
function buildExpiredCookie(cookieName) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}

module.exports = {
  VIEWER_COOKIE_NAME,
  ADMIN_COOKIE_NAME,
  getAdminPassword,
  parseCookies,
  createViewerSessionToken,
  verifyViewerSessionToken,
  createAdminSessionToken,
  verifyAdminSessionToken,
  buildViewerSessionCookie,
  buildAdminSessionCookie,
  buildExpiredCookie
};
