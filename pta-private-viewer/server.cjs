const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const httpUtilsModule = require("./lib/http-utils.cjs");
const { sendText } = httpUtilsModule.default || httpUtilsModule;

const PORT = Number(process.env.PORT) || 3000;
const ROOT = process.cwd();
const STATIC_ROOT = path.join(ROOT, "public");

/**
 * Content types for the small static file set used by this PoC.
 * @type {Record<string, string>}
 */
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8"
};

/**
 * Resolve and execute a local API module under /api.
 * @param {string} pathname
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @returns {Promise<boolean>}
 */
async function tryHandleApi(pathname, req, res) {
  if (!pathname.startsWith("/api/")) {
    return false;
  }

  const slug = pathname.replace(/^\/api\//, "");
  const modulePath = path.join(ROOT, "api", `${slug}.js`);
  if (!fs.existsSync(modulePath)) {
    sendText(res, 404, "API not found");
    return true;
  }

  try {
    delete require.cache[require.resolve(modulePath)];
    const handler = require(modulePath);
    await handler(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      sendText(res, 500, "Internal Server Error");
    } else {
      res.end();
    }
  }
  return true;
}

/**
 * Resolve a static file path while preventing directory traversal.
 * @param {string} pathname
 * @returns {string|null}
 */
function resolveStaticPath(pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const normalized = path.normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(STATIC_ROOT, normalized);
  if (!filePath.startsWith(STATIC_ROOT)) {
    return null;
  }
  return filePath;
}

/**
 * Serve a static file from the project root.
 * @param {string} pathname
 * @param {import("http").ServerResponse} res
 */
function handleStatic(pathname, res) {
  if (
    pathname.startsWith("/data/") ||
    pathname.startsWith("/node_modules/") ||
    pathname.startsWith("/.venv/") ||
    pathname.startsWith("/.npm-cache/")
  ) {
    sendText(res, 404, "Not Found");
    return;
  }

  const filePath = resolveStaticPath(pathname);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, "Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.end(fs.readFileSync(filePath));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const handled = await tryHandleApi(url.pathname, req, res);
  if (handled) {
    return;
  }
  handleStatic(url.pathname, res);
});

server.listen(PORT, () => {
  console.log(`PTA viewer PoC is running at http://localhost:${PORT}`);
});
